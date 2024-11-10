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

const TargetArea = ({ visible = true }) => (
  <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
    <div className="relative">
      {/* Target area frame with red border */}
      <div className="w-64 h-96 border-2 border-red-500 rounded-lg relative">
        {/* Corner indicators in red */}
        <div className="absolute -left-2 -top-2 w-5 h-5 border-l-4 border-t-4 border-red-500" />
        <div className="absolute -right-2 -top-2 w-5 h-5 border-r-4 border-t-4 border-red-500" />
        <div className="absolute -left-2 -bottom-2 w-5 h-5 border-l-4 border-b-4 border-red-500" />
        <div className="absolute -right-2 -bottom-2 w-5 h-5 border-r-4 border-b-4 border-red-500" />
        
        {/* Center crosshair */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-red-500 opacity-50" />
            <div className="absolute top-0 left-1/2 w-0.5 h-full bg-red-500 opacity-50" />
          </div>
        </div>

        {/* Instruction text */}
        <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
          <span className="bg-black bg-opacity-50 text-white px-3 py-1 rounded-full text-sm">
            Place your image within the frame
          </span>
        </div>
      </div>
    </div>
  </div>
);

const ARViewer = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const [targetLocked, setTargetLocked] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [error, setError] = useState(null);
  const streamRef = useRef(null);

  const detectImageContent = useCallback((imageData) => {
    const data = imageData.data;
    let totalBrightness = 0;
    let totalPixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      totalBrightness += brightness;
    }

    const averageBrightness = totalBrightness / totalPixels;
    return averageBrightness > 30 && averageBrightness < 225;
  }, []);

  const playARVideo = useCallback(() => {
    if (!overlayVideoRef.current || videoPlaying) return;
    overlayVideoRef.current.play();
    setVideoPlaying(true);
  }, [videoPlaying]);

  const initializeImageTracking = useCallback(() => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const targetArea = {
      x: (canvas.width - 256) / 2,
      y: (canvas.height - 384) / 2,
      width: 256,
      height: 384
    };

    const processFrame = () => {
      if (!canvasRef.current || !videoRef.current) return;
      
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(
        targetArea.x, 
        targetArea.y, 
        targetArea.width, 
        targetArea.height
      );

      const hasContent = detectImageContent(imageData);
      
      if (hasContent && !targetLocked) {
        setTimeout(() => {
          setTargetLocked(true);
          playARVideo();
        }, 1000);
      } else if (!hasContent && targetLocked) {
        setTargetLocked(false);
        setVideoPlaying(false);
        if (overlayVideoRef.current) {
          overlayVideoRef.current.pause();
        }
      }

      requestAnimationFrame(processFrame);
    };

    requestAnimationFrame(processFrame);
  }, [detectImageContent, playARVideo, targetLocked]);

  // Auto-start camera on component mount
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
      {/* Main camera view */}
      <video
        ref={videoRef}
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* AR overlay canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
      />

      {/* Target area overlay */}
      {!targetLocked && <TargetArea />}

      {/* AR Video */}
      <video
        ref={overlayVideoRef}
        className={`absolute z-20 ${targetLocked ? 'opacity-100' : 'opacity-0'}`}
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%',
          height: 'auto',
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain'
        }}
        playsInline
        loop
      />

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