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
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const streamRef = useRef(null);
  const modelRef = useRef(null);
  const rafRef = useRef(null);
  const referenceImagesRef = useRef(new Map());

  const [hasPermission, setHasPermission] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [arContent, setArContent] = useState([]);
  const [error, setError] = useState(null);
  const [debug, setDebug] = useState('');
  const [currentMatch, setCurrentMatch] = useState(null);
  const [isModelLoading, setIsModelLoading] = useState(true);

  const addDebug = useCallback((message) => {
    console.log(message);
    setDebug(prev => `${message}\n${prev}`.slice(0, 1000));
  }, []);

  const extractFeatures = useCallback(async (imageElement) => {
    if (!modelRef.current) return null;

    try {
      return tf.tidy(() => {
        const img = tf.browser.fromPixels(imageElement);
        const resized = tf.image.resizeBilinear(img, [224, 224]);
        const normalized = resized.div(255.0);
        const batched = normalized.expandDims(0);
        return modelRef.current.predict(batched).dataSync();
      });
    } catch (error) {
      addDebug(`Feature extraction error: ${error.message}`);
      return null;
    }
  }, [addDebug]);

  const compareFeatures = useCallback((features1, features2) => {
    if (!features1 || !features2) return 0;
    
    try {
      let dotProduct = 0;
      let norm1 = 0;
      let norm2 = 0;
      
      for (let i = 0; i < features1.length; i++) {
        dotProduct += features1[i] * features2[i];
        norm1 += features1[i] * features1[i];
        norm2 += features2[i] * features2[i];
      }
      
      return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    } catch (error) {
      addDebug(`Comparison error: ${error.message}`);
      return 0;
    }
  }, [addDebug]);

  const scanRegions = useCallback((imageData, numRegions = 9) => {
    const regions = [];
    const width = imageData.width;
    const height = imageData.height;
    
    // Calculate grid size
    const gridSize = Math.sqrt(numRegions);
    const regionWidth = Math.floor(width / gridSize);
    const regionHeight = Math.floor(height / gridSize);
    
    // Create scanning regions in a grid pattern
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        regions.push({
          x: x * regionWidth,
          y: y * regionHeight,
          width: regionWidth,
          height: regionHeight
        });
      }
    }
    
    return regions;
  }, []);

  const processFrame = useCallback(async () => {
    if (!canvasRef.current || !videoRef.current || !modelRef.current) return null;

    try {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);

      const regions = scanRegions(canvasRef.current);
      
      for (const region of regions) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = region.width;
        tempCanvas.height = region.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.drawImage(
          canvasRef.current,
          region.x, region.y, region.width, region.height,
          0, 0, region.width, region.height
        );
        
        const frameFeatures = await extractFeatures(tempCanvas);
        if (!frameFeatures) continue;

        for (const [contentId, referenceFeatures] of referenceImagesRef.current.entries()) {
          const similarity = compareFeatures(frameFeatures, referenceFeatures);
          
          if (similarity > 0.5) {
            const content = arContent.find(item => item.id === contentId);
            if (content) {
              return {
                content,
                bbox: region,
                similarity
              };
            }
          }
        }
      }

      return null;
    } catch (error) {
      addDebug(`Frame processing error: ${error.message}`);
      return null;
    }
  }, [scanRegions, extractFeatures, compareFeatures, arContent, addDebug]);

  const scanFrame = useCallback(async () => {
    if (!isScanning) return;

    try {
      const result = await processFrame();
      
      if (result) {
        const { content, bbox } = result;
        
        if (!currentMatch || content.id !== currentMatch.id) {
          setCurrentMatch(content);
          if (overlayVideoRef.current) {
            overlayVideoRef.current.src = content.videoUrl;
            overlayVideoRef.current.style.display = 'block';
            overlayVideoRef.current.style.transform = 
              `translate(${bbox.x}px, ${bbox.y}px)`;
            overlayVideoRef.current.style.width = `${bbox.width}px`;
            overlayVideoRef.current.style.height = `${bbox.height}px`;
            overlayVideoRef.current.play().catch(console.error);
          }
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

    rafRef.current = requestAnimationFrame(scanFrame);
  }, [isScanning, processFrame, currentMatch, addDebug]);

  // Initialize TensorFlow and load model
  useEffect(() => {
    const initTensorFlow = async () => {
      try {
        await tf.setBackend('webgl');
        await tf.ready();
        addDebug('Loading MobileNet model...');
        
        const model = await tf.loadGraphModel(
          'https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v3_small_100_224/feature_vector/5/default/1',
          { fromTFHub: true }
        );
        
        modelRef.current = model;
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
      if (modelRef.current) {
        modelRef.current.dispose();
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
  // Load and preprocess reference images
  useEffect(() => {
    const loadReferenceImages = async () => {
      if (!modelRef.current) return;

      try {
        const querySnapshot = await getDocs(collection(db, 'arContent'));
        const content = [];

        for (const doc of querySnapshot.docs) {
          const data = doc.data();
          try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            await new Promise((resolve, reject) => {
              img.onload = async () => {
                const features = await extractFeatures(img);
                if (features) {
                  referenceImagesRef.current.set(doc.id, features);
                  content.push({
                    id: doc.id,
                    ...data
                  });
                  addDebug(`Processed reference image: ${doc.id}`);
                }
                resolve();
              };
              img.onerror = reject;
              img.src = data.imageUrl;
            });
          } catch (err) {
            addDebug(`Error processing reference image ${doc.id}: ${err.message}`);
          }
        }

        setArContent(content);
        addDebug(`Processed ${content.length} reference images`);
      } catch (error) {
        setError(`Failed to load reference images: ${error.message}`);
        addDebug(`Reference image loading error: ${error.message}`);
      }
    };

    loadReferenceImages();
  }, [isModelLoading, addDebug, extractFeatures]);

  useEffect(() => {
    if (isScanning) {
      scanFrame();
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      setCurrentMatch(null);
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
            <summary className="px-4 py-2 cursor-pointer text-gray-700">Debug Info</summary>
            <pre className="p-4 text-xs font-mono whitespace-pre-wrap h-32 overflow-y-auto">
              {debug}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
};

export default ARViewer;