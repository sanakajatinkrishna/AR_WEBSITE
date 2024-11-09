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
  const animationFrameRef = useRef(null);
  
  const [hasPermission, setHasPermission] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [arContent, setArContent] = useState([]);
  const [error, setError] = useState(null);
  const [debug, setDebug] = useState('');
  const [currentMatch, setCurrentMatch] = useState(null);
  const [isProcessingFrame, setIsProcessingFrame] = useState(false);
  const [matchStatus, setMatchStatus] = useState('');
  const [referenceImages, setReferenceImages] = useState(new Map());

  const addDebug = useCallback((message) => {
    console.log(message);
    setDebug(prev => `${message}\n${prev}`.slice(0, 1000));
  }, []);

  // Load and cache reference images
  const loadReferenceImage = useCallback(async (imageUrl) => {
    if (referenceImages.has(imageUrl)) {
      return referenceImages.get(imageUrl);
    }

    try {
      // Get the actual download URL from Firebase Storage
      const imageRef = ref(storage, imageUrl);
      const downloadURL = await getDownloadURL(imageRef);

      // Create and load the image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = downloadURL;
      });

      // Cache the loaded image
      setReferenceImages(prev => new Map(prev).set(imageUrl, img));
      addDebug(`Successfully loaded reference image: ${imageUrl}`);
      return img;
    } catch (error) {
      addDebug(`Error loading reference image: ${error.message}`);
      throw error;
    }
  }, [referenceImages, addDebug]);

  const processFrame = useCallback(async () => {
    if (!canvasRef.current || !videoRef.current) return null;

    try {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      
      return context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    } catch (error) {
      addDebug(`Error processing frame: ${error.message}`);
      return null;
    }
  }, [addDebug]);

  const compareWithReference = useCallback(async (frameData, referenceImage) => {
    if (!frameData || !referenceImage) return 0;

    try {
      const frameTensor = window.tf.browser.fromPixels(frameData);
      const refTensor = window.tf.browser.fromPixels(referenceImage);

      // Ensure both tensors are the same size
      const targetSize = [224, 224];
      const resizedFrame = window.tf.image.resizeBilinear(frameTensor, targetSize);
      const resizedRef = window.tf.image.resizeBilinear(refTensor, targetSize);

      // Normalize the pixels
      const normalizedFrame = resizedFrame.div(255.0);
      const normalizedRef = resizedRef.div(255.0);

      // Calculate similarity
      const similarity = window.tf.metrics.cosineProximity(
        normalizedFrame.reshape([1, -1]),
        normalizedRef.reshape([1, -1])
      ).dataSync()[0];

      // Cleanup
      [frameTensor, refTensor, resizedFrame, resizedRef, normalizedFrame, normalizedRef]
        .forEach(t => t.dispose());

      return similarity;
    } catch (error) {
      addDebug(`Error comparing images: ${error.message}`);
      return 0;
    }
  }, [addDebug]);

  const scanFrame = useCallback(async () => {
    if (!isScanning || isProcessingFrame) return;

    try {
      setIsProcessingFrame(true);
      const frameData = await processFrame();

      if (!frameData) {
        addDebug('No frame data available');
        return;
      }

      // Check each AR content item
      for (const content of arContent) {
        if (!content.imageUrl) continue;

        try {
          // Get cached or load new reference image
          const referenceImage = await loadReferenceImage(content.imageUrl);
          
          const similarity = await compareWithReference(frameData, referenceImage);
          setMatchStatus(`Similarity: ${similarity.toFixed(3)}`);

          if (similarity > 0.7) {
            addDebug(`Match found! Similarity: ${similarity.toFixed(3)}`);
            setCurrentMatch(content);
            
            if (overlayVideoRef.current && overlayVideoRef.current.paused) {
              overlayVideoRef.current.style.display = 'block';
              await overlayVideoRef.current.play();
            }
            return;
          }
        } catch (error) {
          addDebug(`Error processing content: ${error.message}`);
          continue;
        }
      }

      // Reset if no match found
      if (currentMatch) {
        setCurrentMatch(null);
        if (overlayVideoRef.current) {
          overlayVideoRef.current.pause();
          overlayVideoRef.current.style.display = 'none';
        }
      }

    } catch (error) {
      addDebug(`Scan error: ${error.message}`);
    } finally {
      setIsProcessingFrame(false);
      if (isScanning) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
      }
    }
  }, [isScanning, isProcessingFrame, arContent, processFrame, compareWithReference, currentMatch, loadReferenceImage, addDebug]);

  // Effect for scanning
  useEffect(() => {
    if (isScanning) {
      scanFrame();
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      setCurrentMatch(null);
      if (overlayVideoRef.current) {
        overlayVideoRef.current.pause();
        overlayVideoRef.current.style.display = 'none';
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isScanning, scanFrame]);

  // Load AR content
  useEffect(() => {
    const loadARContent = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'arContent'));
        const content = [];
        querySnapshot.forEach((doc) => {
          content.push({ id: doc.id, ...doc.data() });
        });
        setArContent(content);
        addDebug(`Loaded ${content.length} AR content items`);

        // Preload all reference images
        for (const item of content) {
          if (item.imageUrl) {
            try {
              await loadReferenceImage(item.imageUrl);
            } catch (error) {
              addDebug(`Failed to preload image: ${error.message}`);
            }
          }
        }
      } catch (error) {
        setError(`Failed to load AR content: ${error.message}`);
        addDebug(`AR content load error: ${error.message}`);
      }
    };

    loadARContent();
  }, [addDebug, loadReferenceImage]);

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
          await videoRef.current.play();
          setHasPermission(true);
          addDebug('Camera initialized');
        }
      } catch (err) {
        setError(`Camera access error: ${err.message}`);
        addDebug(`Camera error: ${err.message}`);
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
          
          {/* Status Overlay */}
          <div className="absolute top-2 left-2 right-2 flex justify-between">
            <div className="bg-black bg-opacity-50 text-white px-3 py-1 rounded">
              {isScanning ? 'Scanning...' : 'Ready'}
            </div>
            <div className="bg-black bg-opacity-50 text-white px-3 py-1 rounded">
              {matchStatus}
            </div>
          </div>

          {!hasPermission && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <p className="text-white text-lg">Camera access required</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center gap-4">
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
        
        {/* Debug Panel */}
        <div className="mt-4 p-2 bg-gray-100 rounded text-xs font-mono whitespace-pre-wrap h-32 overflow-y-auto">
          {debug}
        </div>
      </div>
    </div>
  );
};

export default ARViewer;