import React, { useEffect, useState, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import * as tf from '@tensorflow/tfjs';
import './App.css';

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

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [currentContent, setCurrentContent] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [debugMessage, setDebugMessage] = useState('');

  const videoRef = useRef(null);
  const arVideoRef = useRef(null);
  const targetImageRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const initializeCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setDebugMessage('Camera initialized');
    } catch (error) {
      setDebugMessage(`Camera initialization error: ${error.message}`);
    }
  }, []);

  // Initialize TensorFlow and Camera
  useEffect(() => {
    const init = async () => {
      try {
        await tf.ready();
        setDebugMessage('TensorFlow loaded');
        await initializeCamera();
        setIsLoading(false);
      } catch (error) {
        setDebugMessage(`Initialization error: ${error.message}`);
        setIsLoading(false);
      }
    };

    init();

    // Cleanup function
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [initializeCamera]);

  const loadTargetImage = useCallback((imageUrl) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      targetImageRef.current = img;
      setImageLoaded(true);
      setDebugMessage('Target image loaded');
    };
    img.onerror = (err) => {
      setDebugMessage(`Error loading image: ${err.message}`);
    };
    img.src = imageUrl;
  }, []);

  // Firebase listener
  useEffect(() => {
    const q = query(
      collection(db, 'arContent'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type === "modified") {
          const data = change.doc.data();
          setCurrentContent(data);
          loadTargetImage(data.imageUrl);
          setDebugMessage('Content loaded from Firebase');
        }
      });
    });

    return () => unsubscribe();
  }, [loadTargetImage]);

  const compareImages = useCallback(() => {
    if (!videoRef.current || !targetImageRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to match video
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    try {
      // Draw current frame
      ctx.drawImage(videoRef.current, 0, 0);
      
      // Get image data
      const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Draw target image
      ctx.drawImage(targetImageRef.current, 0, 0, canvas.width, canvas.height);
      const targetData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Compare pixel data
      let matches = 0;
      let totalPixels = frameData.data.length / 4;
      
      for (let i = 0; i < frameData.data.length; i += 4) {
        const isMatch = 
          Math.abs(frameData.data[i] - targetData.data[i]) < 50 && // Red
          Math.abs(frameData.data[i + 1] - targetData.data[i + 1]) < 50 && // Green
          Math.abs(frameData.data[i + 2] - targetData.data[i + 2]) < 50; // Blue
        
        if (isMatch) matches++;
      }

      const matchPercentage = (matches / totalPixels) * 100;
      setDebugMessage(`Match percentage: ${matchPercentage.toFixed(2)}%`);

      if (matchPercentage > 30) {
        if (arVideoRef.current && arVideoRef.current.paused) {
          arVideoRef.current.style.display = 'block';
          arVideoRef.current.play().catch(err => {
            setDebugMessage(`Video play error: ${err.message}`);
          });
        }
      } else {
        if (arVideoRef.current) {
          arVideoRef.current.style.display = 'none';
          arVideoRef.current.pause();
        }
      }
    } catch (error) {
      setDebugMessage(`Comparison error: ${error.message}`);
    }
  }, []);

  // Image comparison interval
  useEffect(() => {
    let intervalId;
    if (imageLoaded) {
      intervalId = setInterval(compareImages, 500);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [imageLoaded, compareImages]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="ar-container">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="camera-feed"
        onError={(e) => setDebugMessage(`Video error: ${e.message}`)}
      />
      
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
      />

      {currentContent && (
        <video
          ref={arVideoRef}
          src={currentContent.videoUrl}
          playsInline
          loop
          muted
          className="ar-video"
          style={{ display: 'none' }}
          onError={(e) => setDebugMessage(`AR video error: ${e.message}`)}
        />
      )}

      <div className="debug-overlay">
        {debugMessage}
      </div>
    </div>
  );
}

export default App;