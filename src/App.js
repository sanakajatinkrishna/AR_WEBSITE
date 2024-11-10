import React, { useState, useRef, useEffect } from 'react';
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
      {/* Target area frame */}
      <div className="w-64 h-96 border-2 border-white rounded-lg relative">
        {/* Corner indicators */}
        <div className="absolute -left-2 -top-2 w-5 h-5 border-l-4 border-t-4 border-blue-500" />
        <div className="absolute -right-2 -top-2 w-5 h-5 border-r-4 border-t-4 border-blue-500" />
        <div className="absolute -left-2 -bottom-2 w-5 h-5 border-l-4 border-b-4 border-blue-500" />
        <div className="absolute -right-2 -bottom-2 w-5 h-5 border-r-4 border-b-4 border-blue-500" />
        
        {/* Center crosshair */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white opacity-50" />
            <div className="absolute top-0 left-1/2 w-0.5 h-full bg-white opacity-50" />
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

const StatusMessage = ({ status }) => {
  let message = '';
  let bgColor = 'bg-yellow-500';

  switch (status) {
    case 'aligning':
      message = 'Align image within the target area';
      break;
    case 'aligned':
      message = 'Hold steady - Initializing AR';
      bgColor = 'bg-blue-500';
      break;
    case 'playing':
      message = 'AR Video Playing';
      bgColor = 'bg-green-500';
      break;
    default:
      return null;
  }

  return (
    <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-30 ${bgColor} px-4 py-2 rounded-full text-white text-sm`}>
      {message}
    </div>
  );
};

const ARViewer = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [targetLocked, setTargetLocked] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [status, setStatus] = useState('aligning');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const streamRef = useRef(null);

  // Initialize camera
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
        setCameraActive(true);
        setLoading(false);
        initializeImageTracking();
      }
    } catch (err) {
      setError('Failed to access camera: ' + err.message);
      setLoading(false);
    }
  };

  // Track image in target area
  const initializeImageTracking = () => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    // Set canvas size to match video
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Define target area in center of screen
    const targetArea = {
      x: (canvas.width - 256) / 2,  // 256px = 16rem (w-64)
      y: (canvas.height - 384) / 2, // 384px = 24rem (h-96)
      width: 256,
      height: 384
    };

    const processFrame = () => {
      // Draw current camera frame
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      // Get image data from target area
      const imageData = context.getImageData(
        targetArea.x, 
        targetArea.y, 
        targetArea.width, 
        targetArea.height
      );

      // Simple movement detection
      const hasContent = detectImageContent(imageData);
      
      if (hasContent && !targetLocked) {
        setStatus('aligned');
        // Start a timer to ensure image is steady
        setTimeout(() => {
          setTargetLocked(true);
          setStatus('playing');
          playARVideo();
        }, 1000);
      } else if (!hasContent && targetLocked) {
        setTargetLocked(false);
        setVideoPlaying(false);
        setStatus('aligning');
        if (overlayVideoRef.current) {
          overlayVideoRef.current.pause();
        }
      }

      // Continue processing frames
      requestAnimationFrame(processFrame);
    };

    requestAnimationFrame(processFrame);
  };

  // Detect if there's meaningful content in the target area
  const detectImageContent = (imageData) => {
    const data = imageData.data;
    let totalBrightness = 0;
    let totalPixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      totalBrightness += brightness;
    }

    const averageBrightness = totalBrightness / totalPixels;
    const hasContent = averageBrightness > 30 && averageBrightness < 225;

    return hasContent;
  };

  // Play AR video over detected image
  const playARVideo = () => {
    if (!overlayVideoRef.current || videoPlaying) return;

    overlayVideoRef.current.play();
    setVideoPlaying(true);
  };

  // Fetch video content
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
            setLoading(false);
          } catch (error) {
            setError('Failed to load video content');
            setLoading(false);
          }
        }
      });
    };

    const unsubscribe = fetchARContent();
    return () => unsubscribe();
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      {/* Main camera view */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* AR overlay canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
      />

      {/* Target area overlay */}
      {cameraActive && !targetLocked && (
        <TargetArea />
      )}

      {/* AR Video (positioned over target when active) */}
      <video
        ref={overlayVideoRef}
        className={`absolute z-20 ${targetLocked ? 'opacity-100' : 'opacity-0'}`}
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '256px', // Match target area width
          height: '384px', // Match target area height
        }}
        playsInline
        loop
      />

      {/* Status message */}
      <StatusMessage status={status} />

      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="text-white text-xl">Loading...</div>
        </div>
      )}

      {/* Start button */}
      {!cameraActive && !loading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <button
            onClick={startCamera}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg text-lg font-semibold hover:bg-blue-600"
          >
            Start AR Experience
          </button>
        </div>
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