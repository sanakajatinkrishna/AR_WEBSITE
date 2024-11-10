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
  const [error, setError] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [arContent, setArContent] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Fetch AR content from Firebase
  useEffect(() => {
    const fetchARContent = () => {
      try {
        // Create a query to get the latest AR content
        const q = query(
          collection(db, 'arContent'),
          orderBy('timestamp', 'desc'),
          limit(1)
        );

        // Real-time listener for AR content
        const unsubscribe = onSnapshot(q, async (snapshot) => {
          if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data();
            
            try {
              // Get the actual video URL from Firebase Storage
              const videoUrl = await getDownloadURL(ref(storage, data.fileName.video));
              
              setArContent({
                ...data,
                videoUrl
              });

              // Set the video source
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

  // Initialize camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
        startVisibilityTracking();
      }
    } catch (err) {
      setError('Failed to access camera: ' + err.message);
    }
  };

  // Set up canvas and tracking
  useEffect(() => {
    if (!canvasRef.current || !overlayVideoRef.current) return;

    const canvas = canvasRef.current;
    
    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    return () => {
      window.removeEventListener('resize', setCanvasSize);
    };
  }, []);

  // Visibility tracking setup
  const startVisibilityTracking = () => {
    if (!('ImageCapture' in window)) {
      console.warn('ImageCapture API not available');
      return;
    }

    const track = videoRef.current?.srcObject?.getVideoTracks()[0];
    if (!track) return;

    const imageCapture = new ImageCapture(track);
    let animationFrameId;
    let analyzing = false;

    const analyzeFrame = async () => {
      if (!analyzing) {
        analyzing = true;
        try {
          const imageBitmap = await imageCapture.grabFrame();
          const canvas = document.createElement('canvas');
          canvas.width = imageBitmap.width;
          canvas.height = imageBitmap.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(imageBitmap, 0, 0);
          
          const imageData = ctx.getImageData(
            canvas.width * 0.4,
            canvas.height * 0.4,
            canvas.width * 0.2,
            canvas.height * 0.2
          );
          
          let total = 0;
          for (let i = 0; i < imageData.data.length; i += 4) {
            total += (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
          }
          const average = total / (imageData.data.length / 4);
          
          const newIsVisible = average > 50;
          if (newIsVisible !== isVisible) {
            setIsVisible(newIsVisible);
            if (!newIsVisible && overlayVideoRef.current) {
              overlayVideoRef.current.pause();
            } else if (newIsVisible && overlayVideoRef.current) {
              overlayVideoRef.current.play();
            }
          }
        } catch (error) {
          console.error('Frame analysis error:', error);
        }
        analyzing = false;
      }
      animationFrameId = requestAnimationFrame(analyzeFrame);
    };

    analyzeFrame();

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  };

  // Video control
  const toggleVideo = () => {
    const video = overlayVideoRef.current;
    if (!video) return;
    
    if (video.paused && isVisible) {
      video.play();
    } else {
      video.pause();
    }
  };

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

      {/* Camera Video Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
        onCanPlay={() => videoRef.current?.play()}
      />

      {/* Overlay Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10 h-full w-full"
      />

      {/* Video Overlay */}
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
            onClick={startCamera}
            className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            disabled={loading || !arContent}
          >
            Start Camera
          </button>
        ) : (
          <>
            <button
              onClick={toggleVideo}
              className="rounded-lg bg-green-500 px-4 py-2 text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              disabled={!isVisible}
            >
              Toggle Video Overlay
            </button>
            <div className={`text-sm ${isVisible ? 'text-green-500' : 'text-red-500'}`}>
              Canvas is {isVisible ? 'visible' : 'not visible'}
            </div>
          </>
        )}
      </div>

      {/* Error Message */}
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