import React, { useEffect, useState, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
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
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef(null);
  const arVideoRef = useRef(null);
  const targetImageRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const initializeCamera = useCallback(async () => {
    try {
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            resolve();
          };
        });
        setCameraActive(true);
        setDebugMessage('Camera active and streaming');
      }
    } catch (error) {
      setDebugMessage(`Camera error: ${error.message}`);
      console.error('Camera error:', error);
    }
  }, []);

  // Initialize Camera
  useEffect(() => {
    const init = async () => {
      try {
        await initializeCamera();
        setIsLoading(false);
      } catch (error) {
        setDebugMessage(`Initialization error: ${error.message}`);
        setIsLoading(false);
      }
    };

    init();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [initializeCamera]);

  const loadTargetImage = useCallback(async (imageUrl) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        targetImageRef.current = img;
        setImageLoaded(true);
        setDebugMessage('Target image loaded');
        resolve(img);
      };
      img.onerror = (err) => {
        setDebugMessage(`Error loading image: ${err.message}`);
        reject(err);
      };
      img.src = imageUrl;
    });
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
          loadTargetImage(data.imageUrl).catch(console.error);
        }
      });
    });

    return () => unsubscribe();
  }, [loadTargetImage]);

  const compareImages = useCallback(() => {
    if (!videoRef.current || !targetImageRef.current || !canvasRef.current) return;
    if (!videoRef.current.videoWidth) return; // Make sure video is playing

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // Set canvas size to match video
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    try {
      // Draw current frame
      ctx.drawImage(videoRef.current, 0, 0);
      
      // Get frame data
      const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Create a new canvas for target image
      const targetCanvas = document.createElement('canvas');
      targetCanvas.width = canvas.width;
      targetCanvas.height = canvas.height;
      const targetCtx = targetCanvas.getContext('2d');
      
      // Draw and scale target image
      targetCtx.drawImage(targetImageRef.current, 0, 0, canvas.width, canvas.height);
      const targetData = targetCtx.getImageData(0, 0, canvas.width, canvas.height);

      // Compare pixel data with tolerance
      let matches = 0;
      let totalPixels = frameData.data.length / 4;
      const tolerance = 50; // Increase for more lenient matching
      
      for (let i = 0; i < frameData.data.length; i += 4) {
        const isMatch = 
          Math.abs(frameData.data[i] - targetData.data[i]) < tolerance && // Red
          Math.abs(frameData.data[i + 1] - targetData.data[i + 1]) < tolerance && // Green
          Math.abs(frameData.data[i + 2] - targetData.data[i + 2]) < tolerance; // Blue
        
        if (isMatch) matches++;
      }

      const matchPercentage = (matches / totalPixels) * 100;
      setDebugMessage(`Match: ${matchPercentage.toFixed(1)}% - Camera Active: ${cameraActive}`);

      // Lower threshold for more lenient matching
      if (matchPercentage > 20) {
        if (arVideoRef.current) {
          arVideoRef.current.style.display = 'block';
          if (arVideoRef.current.paused) {
            arVideoRef.current.play().catch(console.error);
          }
        }
      } else {
        if (arVideoRef.current) {
          arVideoRef.current.style.display = 'none';
          arVideoRef.current.pause();
        }
      }
    } catch (error) {
      console.error('Comparison error:', error);
      setDebugMessage(`Comparison error: ${error.message}`);
    }
  }, [cameraActive]);

  // Image comparison interval
  useEffect(() => {
    let intervalId;
    if (imageLoaded && cameraActive) {
      intervalId = setInterval(compareImages, 500);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [imageLoaded, cameraActive, compareImages]);

  if (isLoading) {
    return <div className="loading">Loading camera...</div>;
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
        className="debug-canvas"
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