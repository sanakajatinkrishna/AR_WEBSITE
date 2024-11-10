import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
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
const storage = getStorage(app);

const ARViewer = () => {
  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const streamRef = useRef(null);
  const mobilenetRef = useRef(null);
  const rafRef = useRef(null);

  // State
  const [hasPermission, setHasPermission] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [arContent, setArContent] = useState([]);
  const [error, setError] = useState(null);
  const [debug, setDebug] = useState('');
  const [currentMatch, setCurrentMatch] = useState(null);
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
        addDebug('Models loaded successfully');
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
            const imageRef = ref(storage, data.imageUrl);
            const videoRef = ref(storage, data.videoUrl);
            
            const [imageUrl, videoUrl] = await Promise.all([
              getDownloadURL(imageRef),
              getDownloadURL(videoRef)
            ]);

            content.push({
              id: doc.id,
              ...data,
              imageUrl,
              videoUrl
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

  // Extract features from image
  const extractFeatures = useCallback(async (imageElement) => {
    if (!mobilenetRef.current) return null;

    try {
      const tensor = tf.tidy(() => {
        return tf.browser.fromPixels(imageElement)
          .resizeBilinear([224, 224])
          .toFloat()
          .expandDims(0)
          .div(255.0);
      });

      const features = await mobilenetRef.current.predict(tensor).data();
      tensor.dispose();
      
      return features;
    } catch (error) {
      addDebug(`Feature extraction error: ${error.message}`);
      return null;
    }
  }, [addDebug]);

  // Compare features between images
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
  // Process video frame
  const processFrame = useCallback(async () => {
    if (!canvasRef.current || !videoRef.current) return null;

    try {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);

      const frameFeatures = await extractFeatures(canvasRef.current);
      if (!frameFeatures) return null;

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
          addDebug(`Similarity with ${content.id}: ${similarity.toFixed(3)}`);

          if (similarity > 0.7) {
            return {
              content,
              bbox: {
                x: 0,
                y: 0,
                width: canvasRef.current.width,
                height: canvasRef.current.height
              }
            };
          }
        } catch (error) {
          addDebug(`Error matching content ${content.id}: ${error.message}`);
          continue;
        }
      }

      return null;
    } catch (error) {
      addDebug(`Frame processing error: ${error.message}`);
      return null;
    }
  }, [extractFeatures, compareFeatures, arContent, addDebug]);

  // Main scanning function
  const scanFrame = useCallback(async () => {
    if (!isScanning) return;

    try {
      const result = await processFrame();
      
      if (result) {
        const { content, bbox } = result;
        
        if (!currentMatch) {
          setCurrentMatch(content);
          if (overlayVideoRef.current) {
            overlayVideoRef.current.style.display = 'block';
            overlayVideoRef.current.style.transform = 
              `translate(${bbox.x}px, ${bbox.y}px)`;
            overlayVideoRef.current.style.width = `${bbox.width}px`;
            overlayVideoRef.current.style.height = `${bbox.height}px`;
            await overlayVideoRef.current.play();
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

  // Handle scanning state changes
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
          
          {currentMatch && currentMatch.videoUrl && (
            <video
              ref={overlayVideoRef}
              src={currentMatch.videoUrl}
              className="absolute transform-gpu"
              playsInline
              loop
              muted
              style={{
                display: 'none',
                transition: 'all 0.2s ease-out'
              }}
            />
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
        
        <div className="mt-4 p-2 bg-gray-100 rounded text-xs font-mono whitespace-pre-wrap h-32 overflow-y-auto">
          {debug}
        </div>
      </div>
    </div>
  );
};

export default ARViewer;