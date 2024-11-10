import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

const firebaseConfig = {
  apiKey: "AIzaSyCTNhBokqTimxo-oGstSA8Zw8jIXO3Nhn4",
  authDomain: "app-1238f.firebaseapp.com",
  projectId: "app-1238f",
  storageBucket: "app-1238f.appspot.com",
  messagingSenderId: "12576842624",
  appId: "1:12576842624:web:92eb40fd8c56a9fc475765",
  measurementId: "G-N5Q9K9G3JN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ARViewer = () => {
  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const streamRef = useRef(null);
  const mobilenetRef = useRef(null);
  const rafRef = useRef(null);
  const lastRegionRef = useRef(null);

  // State
  const [hasPermission, setHasPermission] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [arContent, setArContent] = useState([]);
  const [error, setError] = useState(null);
  const [debug, setDebug] = useState('');
  const [currentMatch, setCurrentMatch] = useState(null);
  const [detectedRegion, setDetectedRegion] = useState(null);
  const [isModelLoading, setIsModelLoading] = useState(true);

  // Debug logger
  const addDebug = useCallback((message) => {
    console.log(message);
    setDebug(prev => `${message}\n${prev}`.slice(0, 1000));
  }, []);

  // Initialize TensorFlow and load MobileNet
  useEffect(() => {
    const initTensorFlow = async () => {
      try {
        addDebug('Initializing TensorFlow...');
        await tf.setBackend('webgl');
        await tf.ready();
        addDebug('Loading MobileNet model...');
        
        const model = await tf.loadLayersModel(
          'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json'
        );
        
        mobilenetRef.current = model;
        setIsModelLoading(false);
        addDebug('Model loaded successfully');
      } catch (error) {
        setError(`Model initialization error: ${error.message}`);
        addDebug(`Model initialization failed: ${error.message}`);
        setIsModelLoading(false);
      }
    };

    initTensorFlow();

    return () => {
      if (mobilenetRef.current) {
        mobilenetRef.current.dispose();
      }
    };
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
          
          await new Promise((resolve) => {
            videoRef.current.onloadedmetadata = () => {
              videoRef.current.play().then(resolve);
            };
          });
          
          setHasPermission(true);
          addDebug('Camera initialized successfully');
        }
      } catch (err) {
        setError(`Camera access error: ${err.message}`);
        addDebug(`Camera initialization failed: ${err.message}`);
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

  // Load AR content from Firebase
  useEffect(() => {
    const loadContent = async () => {
      if (isModelLoading) return;
      
      try {
        addDebug('Loading AR content...');
        const querySnapshot = await getDocs(collection(db, 'arContent'));
        const content = [];

        for (const doc of querySnapshot.docs) {
          const data = doc.data();
          try {
            content.push({
              id: doc.id,
              ...data
            });
            
            addDebug(`Loaded content: ${doc.id}`);
          } catch (err) {
            addDebug(`Error loading content ${doc.id}: ${err.message}`);
          }
        }

        setArContent(content);
        addDebug(`Successfully loaded ${content.length} AR items`);
      } catch (error) {
        setError(`Failed to load AR content: ${error.message}`);
        addDebug(`AR content load error: ${error.message}`);
      }
    };

    loadContent();
  }, [isModelLoading, addDebug]);

  // Feature extraction function
  const extractFeatures = useCallback(async (imageElement, region = null) => {
    if (!mobilenetRef.current) return null;

    try {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      
      if (region) {
        tempCanvas.width = 224;
        tempCanvas.height = 224;
        tempCtx.drawImage(
          imageElement,
          region.x, region.y, region.width, region.height,
          0, 0, 224, 224
        );
      } else {
        tempCanvas.width = 224;
        tempCanvas.height = 224;
        tempCtx.drawImage(imageElement, 0, 0, 224, 224);
      }

      const tensor = tf.tidy(() => {
        return tf.browser.fromPixels(tempCanvas)
          .toFloat()
          .div(255.0)
          .expandDims(0);
      });

      const features = await mobilenetRef.current.predict(tensor).data();
      tensor.dispose();

      return features;
    } catch (error) {
      addDebug(`Feature extraction error: ${error.message}`);
      return null;
    }
  }, [addDebug]);

  // Feature comparison function
  const compareFeatures = useCallback((features1, features2) => {
    if (!features1 || !features2 || features1.length !== features2.length) return 0;
    
    try {
      let dotProduct = 0;
      let norm1 = 0;
      let norm2 = 0;
      
      for (let i = 0; i < features1.length; i++) {
        dotProduct += features1[i] * features2[i];
        norm1 += features1[i] * features1[i];
        norm2 += features2[i] * features2[i];
      }
      
      const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
      return Math.max(0, (similarity - 0.5) * 2); // Normalize similarity
    } catch (error) {
      addDebug(`Comparison error: ${error.message}`);
      return 0;
    }
  }, [addDebug]);

  // Process frame with region detection
  const processFrame = useCallback(async () => {
    if (!canvasRef.current || !videoRef.current) return null;

    try {
      const context = canvasRef.current.getContext('2d');
      const width = videoRef.current.videoWidth;
      const height = videoRef.current.videoHeight;
      canvasRef.current.width = width;
      canvasRef.current.height = height;
      context.drawImage(videoRef.current, 0, 0);

      // Define regions to scan
      const regions = [
        { x: 0, y: 0, width, height }, // Full frame
      ];

      if (lastRegionRef.current) {
        // Add the last known region with some padding
        const padding = 50;
        regions.unshift({
          x: Math.max(0, lastRegionRef.current.x - padding),
          y: Math.max(0, lastRegionRef.current.y - padding),
          width: Math.min(width - lastRegionRef.current.x + padding, lastRegionRef.current.width + 2 * padding),
          height: Math.min(height - lastRegionRef.current.y + padding, lastRegionRef.current.height + 2 * padding)
        });
      }

      let bestMatch = null;
      let bestSimilarity = 0;
      let bestRegion = null;

      for (const region of regions) {
        const frameFeatures = await extractFeatures(canvasRef.current, region);
        if (!frameFeatures) continue;

        for (const content of arContent) {
          try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = content.imageUrl;
            });

            const referenceFeatures = await extractFeatures(img);
            if (!referenceFeatures) continue;

            const similarity = compareFeatures(frameFeatures, referenceFeatures);
            
            if (similarity > 0.6 && similarity > bestSimilarity) {
              bestSimilarity = similarity;
              bestMatch = content;
              bestRegion = region;
              
              // If this is a good match in the priority region, stop searching
              if (similarity > 0.8 && regions.indexOf(region) === 0) {
                break;
              }
            }
          } catch (error) {
            continue;
          }
        }
      }

      if (bestMatch && bestRegion) {
        lastRegionRef.current = bestRegion;
        return {
          content: bestMatch,
          bbox: bestRegion,
          similarity: bestSimilarity
        };
      }

      return null;
    } catch (error) {
      addDebug(`Frame processing error: ${error.message}`);
      return null;
    }
  }, [extractFeatures, compareFeatures, arContent, addDebug]);

  // Scan frame function
  const scanFrame = useCallback(async () => {
    if (!isScanning) return;

    try {
      const result = await processFrame();
      
      if (result) {
        const { content, bbox, similarity } = result;
        
        if (!currentMatch || similarity > 0.65) {
          setCurrentMatch(content);
          setDetectedRegion(bbox);
          
          if (overlayVideoRef.current) {
            overlayVideoRef.current.src = content.videoUrl;
            overlayVideoRef.current.style.display = 'block';
            overlayVideoRef.current.style.transform = 
              `translate(${bbox.x}px, ${bbox.y}px)`;
            overlayVideoRef.current.style.width = `${bbox.width}px`;
            overlayVideoRef.current.style.height = `${bbox.height}px`;
            await overlayVideoRef.current.play();
          }
        }
      } else {
        if (currentMatch) {
          setCurrentMatch(null);
          setDetectedRegion(null);
          if (overlayVideoRef.current) {
            overlayVideoRef.current.pause();
            overlayVideoRef.current.style.display = 'none';
          }
        }
      }
    } catch (error) {
      addDebug(`Scan error: ${error.message}`);
    }

    rafRef.current = requestAnimationFrame(scanFrame);
  }, [isScanning, processFrame, currentMatch, addDebug]);

  // Handle scanning state changes
  useEffect(() => {
    if (isScanning) {
      scanFrame();
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      setCurrentMatch(null);
      setDetectedRegion(null);
      if (overlayVideoRef.current) {
        overlayVideoRef.current.pause();
        overlayVideoRef.current.style.display = 'none';
      }
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
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
          
          {currentMatch && detectedRegion && (
            <>
              <div
                className="absolute border-2 border-green-500 pointer-events-none"
                style={{
                  left: `${detectedRegion.x}px`,
                  top: `${detectedRegion.y}px`,
                  width: `${detectedRegion.width}px`,
                  height: `${detectedRegion.height}px`
                }}
              />
              
              <video
                ref={overlayVideoRef}
                className="absolute transform-gpu"
                playsInline
                loop
                muted
                style={{
                  display: 'none',
                  transition: 'all 0.2s ease-out'
                }}
              />
            </>
          )}
          
          <div className="absolute top-2 left-2 right-2 flex justify-between">
            <div className="bg-black bg-opacity-50 text-white px-3 py-1 rounded">
              {isModelLoading ? 'Loading model...' : isScanning ? 'Scanning...' : 'Ready'}
            </div>
          </div>

          {!hasPermission && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <p className="text-white text-lg">Camera access required</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          {hasPermission && !isModelLoading && (
            <button
              onClick={() => setIsScanning(!isScanning)}
              className={`px-6 py-3 rounded-lg font-semibold ${
                isScanning
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
             }`}
              disabled={isModelLoading}
            >
              {isScanning ? 'Stop Scanning' : 'Start Scanning'}
            </button>
          )}
        </div>
        
        <div className="mt-4">
          <details className="bg-gray-50 rounded-lg">
            <summary className="px-4 py-2 cursor-pointer text-gray-700">Debug Information</summary>
            <div className="p-4 text-xs font-mono whitespace-pre-wrap h-32 overflow-y-auto border-t border-gray-200">
              {debug}
            </div>
          </details>
        </div>

        {isModelLoading && (
          <div className="mt-4 text-center text-gray-600">
            <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-2"></div>
            Loading ML model...
          </div>
        )}

        {currentMatch && (
          <div className="mt-4 p-4 bg-green-50 rounded-lg">
            <p className="text-green-700">
              Match found! Similarity: {(currentMatch.similarity || 0).toFixed(2)}
            </p>
          </div>
        )}
      </div>

      {/* Settings Panel */}
      <div className="w-full max-w-2xl mt-4 bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Settings</h2>
        
        <div className="space-y-4">
          <div>
            <label className="flex items-center space-x-2">
              <input 
                type="checkbox"
                className="form-checkbox"
                checked={isScanning}
                onChange={(e) => setIsScanning(e.target.checked)}
                disabled={isModelLoading || !hasPermission}
              />
              <span>Enable continuous scanning</span>
            </label>
          </div>

          {!hasPermission && (
            <div className="text-red-500">
              ⚠️ Camera permission is required for AR functionality
            </div>
          )}

          {error && (
            <div className="text-red-500">
              ⚠️ Error: {error}
            </div>
          )}
        </div>
      </div>

      {/* Help Information */}
      <div className="w-full max-w-2xl mt-4 bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4">How to Use</h2>
        
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Allow camera access when prompted</li>
          <li>Click "Start Scanning" to begin detection</li>
          <li>Point your camera at the target image</li>
          <li>Hold steady when a match is found</li>
          <li>The AR content will appear overlaid on the image</li>
        </ol>

        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-700 mb-2">Tips for Best Results:</h3>
          <ul className="list-disc list-inside space-y-1 text-blue-600">
            <li>Ensure good lighting conditions</li>
            <li>Keep the entire image in frame</li>
            <li>Minimize camera movement</li>
            <li>Avoid glare on the target image</li>
          </ul>
        </div>
      </div>

      {/* Footer */}
      <div className="w-full max-w-2xl mt-4 text-center text-gray-500 text-sm">
        <p>AR Image Scanner v1.0</p>
        <p className="mt-1">Using TensorFlow.js and MobileNet for image recognition</p>
      </div>
    </div>
  );
};

// Cleanup function for tensor memory management
const cleanup = () => {
  tf.disposeVariables();
};

// Add cleanup on window unload
if (typeof window !== 'undefined') {
  window.addEventListener('unload', cleanup);
}

export default ARViewer;