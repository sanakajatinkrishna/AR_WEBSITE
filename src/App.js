import React, { useRef, useState, useCallback, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

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

const App = () => {
  // Rest of the component code remains exactly the same, just removed unused imports and storage initialization
  const contentKey = new URLSearchParams(window.location.search).get('key');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const referenceImageRef = useRef(null);
  const referenceCanvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const debugCanvasRef = useRef(null);
  
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [isMatched, setIsMatched] = useState(false);
  const [matchConfidence, setMatchConfidence] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Start video playback
  const startVideo = useCallback(async () => {
    if (!overlayVideoRef.current || !videoUrl || isVideoPlaying) return;

    try {
      overlayVideoRef.current.src = videoUrl;
      overlayVideoRef.current.muted = false;
      await overlayVideoRef.current.play();
      setIsVideoPlaying(true);
      setDebugInfo('Video playing - Tracking active');
    } catch (error) {
      console.error('Video playback error:', error);
      const playOnClick = async () => {
        try {
          await overlayVideoRef.current.play();
          setIsVideoPlaying(true);
          setDebugInfo('Video playing - Tracking active');
          document.removeEventListener('click', playOnClick);
        } catch (err) {
          console.error('Play on click failed:', err);
        }
      };
      document.addEventListener('click', playOnClick);
      setDebugInfo('Click screen to start video with sound');
    }
  }, [videoUrl, isVideoPlaying]);

  // Enhanced image comparison function
  const compareImages = useCallback((sourceImageData, targetImageData) => {
    const sourceData = sourceImageData.data;
    const targetData = targetImageData.data;
    const debugCtx = debugCanvasRef.current?.getContext('2d');
    
    // Initialize feature points
    let matchingPoints = 0;
    let totalPoints = 0;
    
    // Sample points in a grid
    const gridSize = 10;
    const stepX = Math.floor(sourceImageData.width / gridSize);
    const stepY = Math.floor(sourceImageData.height / gridSize);

    if (debugCtx) {
      debugCtx.clearRect(0, 0, debugCanvasRef.current.width, debugCanvasRef.current.height);
    }

    // Compare color values at grid points
    for (let y = 0; y < sourceImageData.height; y += stepY) {
      for (let x = 0; x < sourceImageData.width; x += stepX) {
        const i = (y * sourceImageData.width + x) * 4;
        
        // Get RGB values for both images
        const sourceColor = {
          r: sourceData[i],
          g: sourceData[i + 1],
          b: sourceData[i + 2]
        };
        
        const targetColor = {
          r: targetData[i],
          g: targetData[i + 1],
          b: targetData[i + 2]
        };
        
        // Calculate color difference
        const colorDiff = Math.sqrt(
          Math.pow(sourceColor.r - targetColor.r, 2) +
          Math.pow(sourceColor.g - targetColor.g, 2) +
          Math.pow(sourceColor.b - targetColor.b, 2)
        );
        
        // Threshold for matching points
        const threshold = 50;
        if (colorDiff < threshold) {
          matchingPoints++;
          if (debugCtx) {
            debugCtx.fillStyle = 'rgba(0, 255, 0, 0.5)';
            debugCtx.fillRect(x, y, 5, 5);
          }
        } else {
          if (debugCtx) {
            debugCtx.fillStyle = 'rgba(255, 0, 0, 0.2)';
            debugCtx.fillRect(x, y, 5, 5);
          }
        }
        totalPoints++;
      }
    }
    
    // Calculate confidence score
    const confidence = (matchingPoints / totalPoints) * 100;
    return confidence;
  }, []);

  // Process video frames
  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const refCanvas = referenceCanvasRef.current;
    const debugCanvas = debugCanvasRef.current;

    if (!video || !canvas || !refCanvas || !referenceImageRef.current) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    
    // Update canvas dimensions if needed
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      if (debugCanvas) {
        debugCanvas.width = video.videoWidth;
        debugCanvas.height = video.videoHeight;
      }
    }
    
    // Draw current frame
    context.drawImage(video, 0, 0);
    
    // Get center portion of camera feed
    const centerWidth = canvas.width * 0.6;
    const centerHeight = canvas.height * 0.6;
    const x = (canvas.width - centerWidth) / 2;
    const y = (canvas.height - centerHeight) / 2;
    
    // Get image data for comparison
    const cameraData = context.getImageData(x, y, centerWidth, centerHeight);
    const referenceData = refCanvas.getContext('2d').getImageData(
      0, 0, refCanvas.width, refCanvas.height
    );
    
    // Compare images and get confidence score
    const confidence = compareImages(cameraData, referenceData);
    setMatchConfidence(confidence);
    
    // Update match status and handle video
    if (confidence > 60 && !isMatched) {
      setIsMatched(true);
      startVideo();
      setDebugInfo(`Match found! Confidence: ${confidence.toFixed(1)}%`);
    } else if (confidence < 40 && isMatched) {
      setIsMatched(false);
      if (overlayVideoRef.current) {
        overlayVideoRef.current.pause();
        setIsVideoPlaying(false);
      }
      setDebugInfo('Match lost - Show image again');
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [compareImages, isMatched, startVideo]);

  // Load content from Firebase
  useEffect(() => {
    const loadContent = async () => {
      if (!contentKey) {
        setDebugInfo('No content key found');
        return;
      }

      try {
        setDebugInfo('Loading content...');
        console.log('Loading content for key:', contentKey);

        const arContentRef = collection(db, 'arContent');
        const q = query(
          arContentRef,
          where('contentKey', '==', contentKey),
          where('isActive', '==', true)
        );

        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          setDebugInfo('Invalid or inactive content');
          return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();
        
        // Load video URL
        setVideoUrl(data.videoUrl);
        
        // Load and prepare reference image
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = data.imageUrl;
        setImageUrl(data.imageUrl);
        
        img.onload = () => {
          referenceImageRef.current = img;
          const canvas = referenceCanvasRef.current;
          const ctx = canvas.getContext('2d');
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          setImageLoaded(true);
          setDebugInfo('Reference image loaded - Ready to track');
          console.log('Reference image loaded:', img.width, 'x', img.height);
        };

      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey]);

  // Initialize camera
  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setDebugInfo('Camera started - Loading reference image');
          animationFrameRef.current = requestAnimationFrame(processFrame);
        }
      } catch (error) {
        console.error('Camera error:', error);
        setDebugInfo(`Camera error: ${error.message}`);
      }
    };

    if (imageUrl && videoUrl) {
      startCamera();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [imageUrl, videoUrl, processFrame]);

  return (
    <div className="fixed inset-0 bg-black">
      <video
        ref={videoRef}
        className="absolute w-full h-full object-cover"
        autoPlay
        playsInline
        muted
      />

      <canvas
        ref={canvasRef}
        className="hidden"
      />

      <canvas
        ref={referenceCanvasRef}
        className="hidden"
      />

      <canvas
        ref={debugCanvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-50"
      />

      {videoUrl && (
        <video
          ref={overlayVideoRef}
          className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4/5 h-4/5 object-contain transition-opacity duration-300 ${
            isMatched ? 'opacity-100' : 'opacity-0'
          }`}
          autoPlay
          playsInline
          loop
          muted={false}
          controls={false}
        />
      )}

      <div className="absolute top-5 left-5 bg-black/70 text-white p-3 rounded-lg">
        <div>Status: {debugInfo}</div>
        <div>Image Loaded: {imageLoaded ? 'Yes' : 'No'}</div>
        <div>Camera Active: {videoRef.current?.srcObject ? 'Yes' : 'No'}</div>
        <div>Match: {isMatched ? 'Yes' : 'No'}</div>
        <div>Confidence: {matchConfidence.toFixed(1)}%</div>
      </div>
    </div>
  );
};

export default App;