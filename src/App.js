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

const ARViewer = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const [targetLocked, setTargetLocked] = useState(false);
  const [error, setError] = useState(null);
  const animationFrameId = useRef(null);
  const detectedArea = useRef(null);

  // Image processing function
  const processFrame = useCallback(() => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Draw current video frame
    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    // Get image data from target area
    const targetArea = {
      x: (canvas.width - 256) / 2,
      y: (canvas.height - 384) / 2,
      width: 256,
      height: 384
    };

    const imageData = context.getImageData(
      targetArea.x,
      targetArea.y,
      targetArea.width,
      targetArea.height
    );

    // Simple detection
    const hasContent = detectContent(imageData);

    if (hasContent && !targetLocked) {
      setTargetLocked(true);
      detectedArea.current = targetArea;
      if (overlayVideoRef.current) {
        overlayVideoRef.current.play();
      }
    } else if (!hasContent && targetLocked) {
      setTargetLocked(false);
      detectedArea.current = null;
      if (overlayVideoRef.current) {
        overlayVideoRef.current.pause();
      }
    }

    animationFrameId.current = requestAnimationFrame(processFrame);
  }, [targetLocked]);

  // Initialize camera
  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();

          // Set canvas size after video is ready
          if (canvasRef.current) {
            canvasRef.current.width = window.innerWidth;
            canvasRef.current.height = window.innerHeight;
            // Start processing frames
            animationFrameId.current = requestAnimationFrame(processFrame);
          }
        }
      } catch (err) {
        setError('Camera access failed: ' + err.message);
      }
    };

    startCamera();

    // Cleanup
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [processFrame]);

  // Load AR video content
  useEffect(() => {
    const loadARContent = () => {
      const q = query(
        collection(db, 'arContent'),
        orderBy('timestamp', 'desc'),
        limit(1)
      );

      return onSnapshot(q, async (snapshot) => {
        if (!snapshot.empty) {
          try {
            const doc = snapshot.docs[0].data();
            const videoUrl = await getDownloadURL(ref(storage, doc.fileName.video));
            if (overlayVideoRef.current) {
              overlayVideoRef.current.src = videoUrl;
              overlayVideoRef.current.load();
            }
          } catch (err) {
            setError('Failed to load AR content');
          }
        }
      });
    };

    const unsubscribe = loadARContent();
    return () => unsubscribe();
  }, []);

  const detectContent = (imageData) => {
    const data = imageData.data;
    let totalBrightness = 0;

    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      totalBrightness += brightness;
    }

    const avgBrightness = totalBrightness / (data.length / 4);
    return avgBrightness > 30 && avgBrightness < 225;
  };

  return (
    <div className="fixed inset-0 bg-black">
      {/* Camera Feed */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
      />

      {/* Processing Canvas - Hidden */}
      <canvas
        ref={canvasRef}
        className="hidden"
      />

      {/* Target Area */}
      {!targetLocked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-96 border-4 border-red-500 rounded-lg" />
        </div>
      )}

      {/* AR Video Overlay */}
      <video
        ref={overlayVideoRef}
        className={`absolute transition-opacity duration-300 ${targetLocked ? 'opacity-100' : 'opacity-0'}`}
        style={{
          top: detectedArea.current ? detectedArea.current.y : '50%',
          left: detectedArea.current ? detectedArea.current.x : '50%',
          width: '256px',
          height: '384px',
          transform: 'translate(-50%, -50%)',
        }}
        playsInline
        loop
      />

      {/* Error Message */}
      {error && (
        <div className="absolute top-4 left-0 right-0 flex justify-center">
          <div className="bg-red-500 text-white px-4 py-2 rounded-lg">
            {error}
          </div>
        </div>
      )}
    </div>
  );
};

export default ARViewer;