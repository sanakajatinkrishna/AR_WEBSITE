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
  const processingCanvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [videoUrl, setVideoUrl] = useState(null);
  const [canvasDetected, setCanvasDetected] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);

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
        await videoRef.current.play();
        setCameraActive(true);
        initializeDetection();
      }
    } catch (err) {
      setError('Failed to access camera: ' + err.message);
    }
  };

  // Fetch video from Firebase
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
            const url = await getDownloadURL(ref(storage, data.fileName.video));
            setVideoUrl(url);

            if (overlayVideoRef.current) {
              overlayVideoRef.current.src = url;
              overlayVideoRef.current.load();
            }
          } catch (error) {
            setError('Failed to load video content');
          }
        }
        setLoading(false);
      });
    };

    const unsubscribe = fetchARContent();
    return () => unsubscribe();
  }, []);

  // Handle video loading
  useEffect(() => {
    if (overlayVideoRef.current && videoUrl) {
      overlayVideoRef.current.onloadeddata = () => {
        setVideoLoaded(true);
      };
      overlayVideoRef.current.onerror = () => {
        setError('Failed to load video');
        setVideoLoaded(false);
      };
    }
  }, [videoUrl]);

  // Simple canvas detection using brightness threshold
  const detectCanvas = (imageData) => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    let brightRegions = [];
    const threshold = 200; // Brightness threshold
    
    for (let y = 0; y < height; y += 10) {
      for (let x = 0; x < width; x += 10) {
        const i = (y * width + x) * 4;
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        
        if (brightness > threshold) {
          brightRegions.push({ x, y });
        }
      }
    }

    if (brightRegions.length > 100) {
      const xs = brightRegions.map(p => p.x);
      const ys = brightRegions.map(p => p.y);
      
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      
      const width = maxX - minX;
      const height = maxY - minY;
      const ratio = width / height;
      
      if (ratio > 0.5 && ratio < 2.0) {
        return {
          x: minX,
          y: minY,
          width,
          height
        };
      }
    }
    
    return null;
  };

  const initializeDetection = () => {
    const processFrame = () => {
      if (!videoRef.current || !canvasRef.current || !processingCanvasRef.current || !videoLoaded) return;

      const procCanvas = processingCanvasRef.current;
      const procCtx = procCanvas.getContext('2d');
      const displayCanvas = canvasRef.current;
      const displayCtx = displayCanvas.getContext('2d');

      // Set canvas sizes
      procCanvas.width = videoRef.current.videoWidth;
      procCanvas.height = videoRef.current.videoHeight;
      displayCanvas.width = window.innerWidth;
      displayCanvas.height = window.innerHeight;

      // Draw video frame to processing canvas
      procCtx.drawImage(videoRef.current, 0, 0);
      
      // Get image data for analysis
      const imageData = procCtx.getImageData(0, 0, procCanvas.width, procCanvas.height);
      
      // Detect canvas in frame
      const detectedRegion = detectCanvas(imageData);

      if (detectedRegion && overlayVideoRef.current) {
        setCanvasDetected(true);

        // Clear display canvas
        displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);

        // Scale the detected region to match display canvas
        const scaleX = displayCanvas.width / procCanvas.width;
        const scaleY = displayCanvas.height / procCanvas.height;
        
        const scaledRegion = {
          x: detectedRegion.x * scaleX,
          y: detectedRegion.y * scaleY,
          width: detectedRegion.width * scaleX,
          height: detectedRegion.height * scaleY
        };

        // Draw video onto detected region
        if (!overlayVideoRef.current.paused) {
          displayCtx.drawImage(
            overlayVideoRef.current,
            scaledRegion.x,
            scaledRegion.y,
            scaledRegion.width,
            scaledRegion.height
          );
        }
      } else {
        setCanvasDetected(false);
        displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
      }

      // Continue detection
      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    animationFrameRef.current = requestAnimationFrame(processFrame);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Start button should only be enabled when video is loaded
  const canStart = !loading && videoUrl && !cameraActive;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      {/* Loading State */}
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

      {/* Processing Canvas (hidden) */}
      <canvas
        ref={processingCanvasRef}
        className="hidden"
      />

      {/* Overlay Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10 h-full w-full"
      />

      {/* Hidden Video Element */}
      <video
        ref={overlayVideoRef}
        className="hidden"
        playsInline
        loop
        muted
        autoPlay
      />

      {/* Controls */}
      <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center">
        {!cameraActive && (
          <button
            onClick={startCamera}
            className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-gray-400"
            disabled={!canStart}
          >
            {loading ? 'Loading Video...' : 'Start Camera'}
          </button>
        )}
      </div>

      {/* Status Messages */}
      <div className="absolute top-4 left-0 right-0 z-20 flex justify-center">
        {canvasDetected && videoLoaded && (
          <div className="rounded-lg bg-green-500 px-4 py-2 text-white">
            Canvas Detected - Playing Video
          </div>
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
    </div>
  );
};

export default ARCameraViewer;