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

const ARCameraViewer = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPermission, setCameraPermission] = useState(false);
  const [error, setError] = useState(null);
  const [arContent, setArContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const streamRef = useRef(null);

  // Check camera permissions
  const checkCameraPermissions = async () => {
    try {
      const result = await navigator.permissions.query({ name: 'camera' });
      setCameraPermission(result.state === 'granted');
      result.addEventListener('change', (e) => {
        setCameraPermission(e.target.state === 'granted');
      });
    } catch (err) {
      console.warn('Permissions API not supported, will try direct camera access');
    }
  };

  // Request camera access
  const requestCameraAccess = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Camera access error:', err);
      setError(`Camera access denied: ${err.message}`);
      return false;
    }
  };

  // Initialize component
  useEffect(() => {
    checkCameraPermissions();
    
    // Cleanup function
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Fetch AR content from Firebase
  useEffect(() => {
    const fetchARContent = () => {
      try {
        const q = query(
          collection(db, 'arContent'),
          orderBy('timestamp', 'desc'),
          limit(1)
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
          if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data();
            
            try {
              const videoUrl = await getDownloadURL(ref(storage, data.fileName.video));
              
              setArContent({
                ...data,
                videoUrl
              });

              if (overlayVideoRef.current) {
                overlayVideoRef.current.src = videoUrl;
                overlayVideoRef.current.load();
              }
            } catch (error) {
              console.error('Error getting download URL:', error);
              setError('Failed to load video content');
            }
          }
          setLoading(false);
        }, (error) => {
          console.error('Firebase error:', error);
          setError('Failed to connect to database');
          setLoading(false);
        });

        return unsubscribe;
      } catch (error) {
        console.error('Error setting up Firebase listener:', error);
        setError('Failed to connect to database');
        setLoading(false);
      }
    };

    const unsubscribe = fetchARContent();
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Handle start camera button click
  const handleStartCamera = async () => {
    const success = await requestCameraAccess();
    if (success) {
      setupARCanvas();
    }
  };

  // Setup AR canvas
  const setupARCanvas = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const updateCanvasSize = () => {
      const displayWidth = window.innerWidth;
      const displayHeight = window.innerHeight;
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      
      // Clear and set default state
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    // Start rendering loop
    const render = () => {
      if (ctx && videoRef.current && arContent?.videoUrl) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw video frame if video is playing
        if (!overlayVideoRef.current?.paused) {
          ctx.drawImage(
            overlayVideoRef.current,
            canvas.width * 0.1, // X position
            canvas.height * 0.1, // Y position
            canvas.width * 0.8, // Width
            canvas.height * 0.6  // Height
          );
        }
      }
      requestAnimationFrame(render);
    };

    render();
  };

  // Toggle video playback
  const toggleVideo = () => {
    if (overlayVideoRef.current) {
      if (overlayVideoRef.current.paused) {
        overlayVideoRef.current.play();
      } else {
        overlayVideoRef.current.pause();
      }
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="rounded-lg bg-white p-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          </div>
        </div>
      )}

      {/* Camera Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* AR Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10 h-full w-full"
      />

      {/* Hidden Video for AR Content */}
      <video
        ref={overlayVideoRef}
        className="hidden"
        playsInline
        loop
        muted
      />

      {/* Controls */}
      <div className="absolute bottom-4 left-0 right-0 z-20 flex flex-col items-center space-y-2">
        {!cameraActive ? (
          <button
            onClick={handleStartCamera}
            disabled={loading || !arContent}
            className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400"
          >
            {loading ? 'Loading...' : 'Start Camera'}
          </button>
        ) : (
          <button
            onClick={toggleVideo}
            className="rounded-lg bg-green-500 px-4 py-2 text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Toggle AR Video
          </button>
        )}
      </div>

      {/* Error Messages */}
      {error && (
        <div className="absolute inset-x-0 top-4 z-30 text-center">
          <div className="inline-block rounded-lg bg-red-500 px-4 py-2 text-white">
            {error}
          </div>
        </div>
      )}

      {/* Permission Status */}
      {!cameraPermission && !cameraActive && (
        <div className="absolute inset-x-0 top-16 z-30 text-center">
          <div className="inline-block rounded-lg bg-yellow-500 px-4 py-2 text-white">
            Camera permission required
          </div>
        </div>
      )}
    </div>
  );
};

export default ARCameraViewer;