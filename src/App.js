import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Firebase config
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

  const addDebug = useCallback((message) => {
    console.log(message); // For immediate feedback in console
    setDebug(prev => `${message}\n${prev}`.slice(0, 1000)); // Keep last 1000 chars
  }, []);

  // Process a single frame from the video
  const processFrame = useCallback(async () => {
    if (!canvasRef.current || !videoRef.current) return;

    const context = canvasRef.current.getContext('2d');
    // Flip canvas horizontally for front camera if needed
    context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // Get frame data for processing
    const frameData = context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    return frameData;
  }, []);

  // Compare current frame with reference image
  const compareWithReference = useCallback(async (frameData, referenceImage) => {
    try {
      // Convert frame to tensor
      const frameTensor = window.tf.browser.fromPixels(frameData);
      const resizedFrame = window.tf.image.resizeBilinear(frameTensor, [224, 224]);
      const normalizedFrame = resizedFrame.div(255.0);

      // Convert reference image to tensor
      const refTensor = window.tf.browser.fromPixels(referenceImage);
      const resizedRef = window.tf.image.resizeBilinear(refTensor, [224, 224]);
      const normalizedRef = resizedRef.div(255.0);

      // Calculate similarity score
      const frameFeatures = normalizedFrame.reshape([1, -1]);
      const refFeatures = normalizedRef.reshape([1, -1]);
      
      const similarity = window.tf.metrics.cosineProximity(frameFeatures, refFeatures).dataSync()[0];

      // Cleanup tensors
      [frameTensor, resizedFrame, normalizedFrame, refTensor, resizedRef, normalizedRef, frameFeatures, refFeatures]
        .forEach(tensor => tensor.dispose());

      return similarity;
    } catch (error) {
      addDebug(`Error comparing images: ${error.message}`);
      return 0;
    }
  }, [addDebug]);

  // Main scanning function
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

        // Load reference image
        const referenceImage = new Image();
        referenceImage.crossOrigin = 'anonymous';
        
        try {
          // Load image and wait for it
          await new Promise((resolve, reject) => {
            referenceImage.onload = resolve;
            referenceImage.onerror = reject;
            referenceImage.src = content.imageUrl;
          });

          const similarity = await compareWithReference(frameData, referenceImage);
          
          // Update match status for debugging
          setMatchStatus(`Similarity: ${similarity.toFixed(3)}`);

          // If we have a good match
          if (similarity > 0.7) { // Adjust threshold as needed
            addDebug(`Match found! Similarity: ${similarity.toFixed(3)}`);
            setCurrentMatch(content);
            
            // Play the video
            if (overlayVideoRef.current && overlayVideoRef.current.paused) {
              overlayVideoRef.current.style.display = 'block';
              await overlayVideoRef.current.play();
              addDebug('Playing video overlay');
            }
            return; // Stop checking other content once we find a match
          }
        } catch (error) {
          addDebug(`Error processing reference image: ${error.message}`);
          continue;
        }
      }

      // If we get here, no match was found
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
      // Continue scanning
      if (isScanning) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
      }
    }
  }, [isScanning, isProcessingFrame, arContent, processFrame, compareWithReference, currentMatch, addDebug]);

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
          video: { facingMode: 'environment' }
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
            <>
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
            </>
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