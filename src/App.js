import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCTNhBokqTimxo-oGstSA8Zw8jIXO3Nhn4",
  authDomain: "app-1238f.firebaseapp.com",
  projectId: "app-1238f",
  storageBucket: "app-1238f.appspot.com",
  messagingSenderId: "12576842624",
  appId: "1:12576842624:web:92eb40fd8c56a9fc475765",
  measurementId: "G-N5Q9K9G3JN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const ARViewer = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const streamRef = useRef(null);
  
  const [hasPermission, setHasPermission] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [arContent, setArContent] = useState([]);
  const [error, setError] = useState(null);
  const [debug, setDebug] = useState('');
  const [currentMatch, setCurrentMatch] = useState(null);

  const addDebug = useCallback((message) => {
    console.log(message);
    setDebug(prev => `${message}\n${prev}`);
  }, []);

  // Load AR content from Firestore and get download URLs
  useEffect(() => {
    const loadARContent = async () => {
      try {
        addDebug('Loading AR content...');
        const querySnapshot = await getDocs(collection(db, 'arContent'));
        const content = [];
        
        for (const doc of querySnapshot.docs) {
          const data = doc.data();
          try {
            // Get actual download URLs for both image and video
            const imageRef = ref(storage, data.imageUrl);
            const videoRef = ref(storage, data.videoUrl);
            
            const [imageDownloadUrl, videoDownloadUrl] = await Promise.all([
              getDownloadURL(imageRef),
              getDownloadURL(videoRef)
            ]);

            content.push({
              id: doc.id,
              ...data,
              imageUrl: imageDownloadUrl,
              videoUrl: videoDownloadUrl
            });
            
            addDebug(`Loaded content ID: ${doc.id}`);
          } catch (error) {
            addDebug(`Error loading content ${doc.id}: ${error.message}`);
          }
        }
        
        setArContent(content);
        addDebug(`Successfully loaded ${content.length} AR content items`);
      } catch (error) {
        setError(`Failed to load AR content: ${error.message}`);
        addDebug(`AR content load error: ${error.message}`);
      }
    };

    loadARContent();
  }, [addDebug]);

  // Initialize camera
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          setHasPermission(true);
          addDebug('Camera initialized successfully');
        }
      } catch (err) {
        setError(`Camera access error: ${err.message}`);
        setHasPermission(false);
      }
    };

    initCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [addDebug]);

  const matchImage = useCallback(async (capturedCanvas) => {
    if (!arContent.length) return null;
    
    try {
      // Convert canvas to tensor
      const capturedTensor = window.tf.browser.fromPixels(capturedCanvas);
      const resizedCaptured = window.tf.image.resizeBilinear(capturedTensor, [224, 224]);
      const normalizedCaptured = resizedCaptured.div(255.0);

      for (const content of arContent) {
        // Load and process reference image
        const refImage = new Image();
        refImage.crossOrigin = 'anonymous';
        
        try {
          await new Promise((resolve, reject) => {
            refImage.onload = resolve;
            refImage.onerror = reject;
            refImage.src = content.imageUrl;
          });

          const refTensor = window.tf.browser.fromPixels(refImage);
          const resizedRef = window.tf.image.resizeBilinear(refTensor, [224, 224]);
          const normalizedRef = resizedRef.div(255.0);

          // Calculate similarity
          const similarity = window.tf.metrics.cosineProximity(
            normalizedCaptured.reshape([1, -1]),
            normalizedRef.reshape([1, -1])
          ).dataSync()[0];

          // Cleanup tensors
          refTensor.dispose();
          resizedRef.dispose();
          normalizedRef.dispose();

          addDebug(`Similarity with ${content.id}: ${similarity.toFixed(3)}`);

          if (similarity > 0.7) {
            return content;
          }
        } catch (error) {
          addDebug(`Error processing reference image: ${error.message}`);
        }
      }

      // Cleanup captured tensors
      capturedTensor.dispose();
      resizedCaptured.dispose();
      normalizedCaptured.dispose();

      return null;
    } catch (error) {
      addDebug(`Error in matchImage: ${error.message}`);
      return null;
    }
  }, [arContent, addDebug]);

  const scanFrame = useCallback(async () => {
    if (!isScanning || !canvasRef.current || !videoRef.current) return;

    try {
      // Draw current frame to canvas
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);

      // Try to find a match
      const match = await matchImage(canvasRef.current);

      if (match) {
        addDebug('Match found! Playing video...');
        setCurrentMatch(match);
        
        if (overlayVideoRef.current) {
          overlayVideoRef.current.style.display = 'block';
          await overlayVideoRef.current.play();
        }
      } else if (currentMatch) {
        setCurrentMatch(null);
        if (overlayVideoRef.current) {
          overlayVideoRef.current.pause();
          overlayVideoRef.current.style.display = 'none';
        }
      }
    } catch (error) {
      addDebug(`Scan error: ${error.message}`);
    }

    if (isScanning) {
      requestAnimationFrame(scanFrame);
    }
  }, [isScanning, matchImage, currentMatch, addDebug]);

  useEffect(() => {
    if (isScanning) {
      scanFrame();
    } else {
      setCurrentMatch(null);
      if (overlayVideoRef.current) {
        overlayVideoRef.current.pause();
        overlayVideoRef.current.style.display = 'none';
      }
    }
  }, [isScanning, scanFrame]);

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-center mb-6">AR Image Scanner</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-0"
          />
          {currentMatch && currentMatch.videoUrl && (
            <video
              ref={overlayVideoRef}
              src={currentMatch.videoUrl}
              className="absolute top-0 left-0 w-full h-full object-cover"
              playsInline
              loop
              muted
              style={{ display: 'none' }}
            />
          )}
          
          <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-3 py-1 rounded">
            {isScanning ? 'Scanning...' : 'Ready'}
          </div>

          {!hasPermission && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <p className="text-white text-lg">Camera access required</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          {hasPermission && (
            <button
              onClick={() => setIsScanning(!isScanning)}
              className={`px-6 py-3 rounded-lg font-semibold ${
                isScanning
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {isScanning ? 'Stop Scanning' : 'Start Scanning'}
            </button>
          )}
        </div>
        
        <div className="mt-4 p-2 bg-gray-100 rounded text-xs font-mono whitespace-pre-wrap h-32 overflow-y-auto">
          {debug}
        </div>
      </div>
    </div>
  );
};

export default ARViewer;