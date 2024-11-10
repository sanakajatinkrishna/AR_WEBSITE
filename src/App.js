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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Simple Alert Component
const Alert = ({ children }) => (
  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
    {children}
  </div>
);

const ARViewer = () => {
  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const modelRef = useRef(null);

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
    setDebug(prev => `${message}\n${prev}`);
  }, []);

  // Initialize TensorFlow
  useEffect(() => {
    const loadModel = async () => {
      try {
        addDebug('Loading TensorFlow model...');
        const model = await window.tf.loadGraphModel(
          'https://tfhub.dev/tensorflow/tfjs-model/ssd_mobilenet_v2/1/default/1'
        );
        modelRef.current = model;
        setIsModelLoading(false);
        addDebug('Model loaded successfully');
      } catch (error) {
        setError(`Model loading error: ${error.message}`);
        addDebug(`Model loading error: ${error.message}`);
        setIsModelLoading(false);
      }
    };

    if (window.tf) {
      loadModel();
    } else {
      setError('TensorFlow not loaded');
      setIsModelLoading(false);
    }

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
          await videoRef.current.play();
          setHasPermission(true);
          addDebug('Camera initialized');
        }
      } catch (err) {
        setError(`Camera error: ${err.message}`);
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

  // Load AR content
  useEffect(() => {
    const loadContent = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'arContent'));
        const content = [];

        for (const doc of querySnapshot.docs) {
          const data = doc.data();
          try {
            // Get download URLs
            const [imageUrl, videoUrl] = await Promise.all([
              getDownloadURL(ref(storage, data.imageUrl)),
              getDownloadURL(ref(storage, data.videoUrl))
            ]);

            content.push({
              id: doc.id,
              ...data,
              imageUrl,
              videoUrl
            });
          } catch (e) {
            addDebug(`Error loading content ${doc.id}: ${e.message}`);
          }
        }

        setArContent(content);
        addDebug(`Loaded ${content.length} AR items`);
      } catch (error) {
        setError(`Content loading error: ${error.message}`);
        addDebug(`Content loading error: ${error.message}`);
      }
    };

    loadContent();
  }, [addDebug]);
  // Image matching function
  const matchImage = useCallback(async (tensor) => {
    if (!modelRef.current || !tensor) return null;
    
    try {
      const predictions = await modelRef.current.executeAsync(tensor.expandDims(0));
      const scores = predictions[5].dataSync();
      const boxes = predictions[1].dataSync();
      
      // Cleanup tensors
      predictions.forEach(t => t.dispose());
      
      // Find best match
      let bestMatch = { score: 0, box: null };
      for (let i = 0; i < scores.length; i++) {
        if (scores[i] > bestMatch.score) {
          bestMatch = {
            score: scores[i],
            box: [
              boxes[i * 4],
              boxes[i * 4 + 1],
              boxes[i * 4 + 2],
              boxes[i * 4 + 3]
            ]
          };
        }
      }
      
      return bestMatch.score > 0.5 ? bestMatch : null;
    } catch (error) {
      addDebug(`Matching error: ${error.message}`);
      return null;
    }
  }, [addDebug]);

  // Frame processing
  const processFrame = useCallback(async () => {
    if (!canvasRef.current || !videoRef.current) return;

    try {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);

      const tensor = window.tf.browser.fromPixels(canvasRef.current);
      const match = await matchImage(tensor);
      tensor.dispose();

      if (match) {
        const { box } = match;
        return {
          x: Math.round(box[1] * canvasRef.current.width),
          y: Math.round(box[0] * canvasRef.current.height),
          width: Math.round((box[3] - box[1]) * canvasRef.current.width),
          height: Math.round((box[2] - box[0]) * canvasRef.current.height)
        };
      }
      
      return null;
    } catch (error) {
      addDebug(`Processing error: ${error.message}`);
      return null;
    }
  }, [matchImage, addDebug]);

  // Scanning function
  const scanFrame = useCallback(async () => {
    if (!isScanning) return;

    try {
      const bbox = await processFrame();
      
      if (bbox) {
        if (!currentMatch && arContent.length > 0) {
          setCurrentMatch(arContent[0]);
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
  }, [isScanning, processFrame, currentMatch, arContent, addDebug]);

  // Handle scanning state
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
          <Alert>{error}</Alert>
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