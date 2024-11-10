import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

// Firebase Configuration
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

const TargetArea = () => (
  <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
    <div className="relative">
      <div className="w-64 h-96 border-4 border-red-500 rounded-lg relative" />
    </div>
  </div>
);

const ARViewer = () => {
  const videoRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const [targetLocked, setTargetLocked] = useState(false);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [error, setError] = useState(null);
  const streamRef = useRef(null);
  const detectionCanvasRef = useRef(null);

  // Track the last detected position for smooth transitions
  const lastDetectedPosition = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const detectImageContent = useCallback((imageData, x, y, width, height) => {
    const data = imageData.data;
    let totalBrightness = 0;
    let totalPixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      totalBrightness += brightness;
    }

    const averageBrightness = totalBrightness / totalPixels;
    const hasContent = averageBrightness > 30 && averageBrightness < 225;

    if (hasContent) {
      lastDetectedPosition.current = { x, y, width, height };
      return true;
    }
    return false;
  }, []);

  const initializeImageTracking = useCallback(() => {
    if (!videoRef.current || !detectionCanvasRef.current) return;

    const canvas = detectionCanvasRef.current;
    const context = canvas.getContext('2d');
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const processFrame = () => {
      if (!videoRef.current || !detectionCanvasRef.current) return;
      
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      // Define detection area (center of screen)
      const detectionArea = {
        x: (canvas.width - 256) / 2,
        y: (canvas.height - 384) / 2,
        width: 256,
        height: 384
      };

      const imageData = context.getImageData(
        detectionArea.x,
        detectionArea.y,
        detectionArea.width,
        detectionArea.height
      );

      const hasContent = detectImageContent(
        imageData,
        detectionArea.x,
        detectionArea.y,
        detectionArea.width,
        detectionArea.height
      );

      if (hasContent && !targetLocked) {
        setTargetLocked(true);
        setImagePosition(lastDetectedPosition.current);
        if (overlayVideoRef.current) {
          overlayVideoRef.current.play();
        }
      } else if (!hasContent && targetLocked) {
        setTargetLocked(false);
        if (overlayVideoRef.current) {
          overlayVideoRef.current.pause();
        }
      } else if (hasContent && targetLocked) {
        // Update position while tracking
        setImagePosition(lastDetectedPosition.current);
      }

      requestAnimationFrame(processFrame);
    };

    requestAnimationFrame(processFrame);
  }, [detectImageContent, targetLocked]);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        });
        
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          initializeImageTracking();
        }
      } catch (err) {
        setError('Failed to access camera: ' + err.message);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [initializeImageTracking]);

  useEffect(() => {
    const fetchARContent = () => {
      const q = query(
        collection(db, 'arContent'),
        orderBy('timestamp', 'desc'),
        limit(1)
      );

      return onSnapshot(q, async (snapshot) => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();
          
          try {
            const videoUrl = await getDownloadURL(ref(storage, data.fileName.video));
            if (overlayVideoRef.current) {
              overlayVideoRef.current.src = videoUrl;
              overlayVideoRef.current.load();
            }
          } catch (error) {
            setError('Failed to load video content');
          }
        }
      });
    };

    const unsubscribe = fetchARContent();
    return () => unsubscribe();
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      {/* Camera feed */}
      <video
        ref={videoRef}
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Hidden canvas for image detection */}
      <canvas
        ref={detectionCanvasRef}
        className="hidden"
      />

      {/* Target area overlay when not locked */}
      {!targetLocked && <TargetArea />}

      {/* AR Video overlay */}
      {targetLocked && (
        <video
          ref={overlayVideoRef}
          className="absolute z-20"
          style={{
            left: `${imagePosition.x}px`,
            top: `${imagePosition.y}px`,
            width: `${imagePosition.width}px`,
            height: `${imagePosition.height}px`,
            transition: 'all 0.1s ease-out' // Smooth movement
          }}
          playsInline
          loop
        />
      )}

      {/* Error message */}
      {error && (
        <div className="absolute top-4 left-0 right-0 z-50 flex justify-center">
          <div className="bg-red-500 text-white px-4 py-2 rounded-lg">
            {error}
          </div>
        </div>
      )}
    </div>
  );
};

export default ARViewer;