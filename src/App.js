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
  const [detailedLogs, setDetailedLogs] = useState([]);
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [isMatched, setIsMatched] = useState(false);
  const [matchConfidence, setMatchConfidence] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Add log function
  const addLog = useCallback((message) => {
    setDetailedLogs(logs => {
      const newLogs = [...logs, { time: new Date().toLocaleTimeString(), message }];
      return newLogs.slice(-5); // Keep only last 5 logs
    });
  }, []);

  // Start video playback
  const startVideo = useCallback(async () => {
    if (!overlayVideoRef.current || !videoUrl || isVideoPlaying) return;

    try {
      overlayVideoRef.current.src = videoUrl;
      overlayVideoRef.current.muted = false;
      await overlayVideoRef.current.play();
      setIsVideoPlaying(true);
      setDebugInfo('Video playing - Keep the image steady');
      addLog('Video playback started');
    } catch (error) {
      console.error('Video playback error:', error);
      const playOnClick = async () => {
        try {
          await overlayVideoRef.current.play();
          setIsVideoPlaying(true);
          setDebugInfo('Video playing - Keep the image steady');
          document.removeEventListener('click', playOnClick);
          addLog('Video playback started after click');
        } catch (err) {
          console.error('Play on click failed:', err);
          addLog('Video playback failed: ' + err.message);
        }
      };
      document.addEventListener('click', playOnClick);
      setDebugInfo('👆 Tap screen to start video with sound');
      addLog('Waiting for user interaction to play video');
    }
  }, [videoUrl, isVideoPlaying, addLog]);

  // Enhanced image comparison function with more logging
  const compareImages = useCallback((sourceImageData, targetImageData) => {
    if (!scanning) {
      setScanning(true);
      addLog('Started image scanning');
    }

    const sourceData = sourceImageData.data;
    const targetData = targetImageData.data;
    const debugCtx = debugCanvasRef.current?.getContext('2d');
    
    let matchingPoints = 0;
    let totalPoints = 0;
    
    const gridSize = 10;
    const stepX = Math.floor(sourceImageData.width / gridSize);
    const stepY = Math.floor(sourceImageData.height / gridSize);

    if (debugCtx) {
      debugCtx.clearRect(0, 0, debugCanvasRef.current.width, debugCanvasRef.current.height);
      
      // Draw scanning rectangle
      debugCtx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
      debugCtx.lineWidth = 2;
      debugCtx.strokeRect(
        sourceImageData.width * 0.2,
        sourceImageData.height * 0.2,
        sourceImageData.width * 0.6,
        sourceImageData.height * 0.6
      );
    }

    // Compare pixels
    for (let y = 0; y < sourceImageData.height; y += stepY) {
      for (let x = 0; x < sourceImageData.width; x += stepX) {
        const i = (y * sourceImageData.width + x) * 4;
        
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
        
        const colorDiff = Math.sqrt(
          Math.pow(sourceColor.r - targetColor.r, 2) +
          Math.pow(sourceColor.g - targetColor.g, 2) +
          Math.pow(sourceColor.b - targetColor.b, 2)
        );
        
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
    
    const confidence = (matchingPoints / totalPoints) * 100;
    return confidence;
  }, [scanning, addLog]);

  // Process video frames with enhanced feedback
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
    
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      if (debugCanvas) {
        debugCanvas.width = video.videoWidth;
        debugCanvas.height = video.videoHeight;
      }
    }
    
    context.drawImage(video, 0, 0);
    
    const centerWidth = canvas.width * 0.6;
    const centerHeight = canvas.height * 0.6;
    const x = (canvas.width - centerWidth) / 2;
    const y = (canvas.height - centerHeight) / 2;
    
    const cameraData = context.getImageData(x, y, centerWidth, centerHeight);
    const referenceData = refCanvas.getContext('2d').getImageData(
      0, 0, refCanvas.width, refCanvas.height
    );
    
    const confidence = compareImages(cameraData, referenceData);
    setMatchConfidence(confidence);
    
    if (confidence > 60 && !isMatched) {
      setIsMatched(true);
      startVideo();
      setDebugInfo('✅ Match found! Keep steady');
      addLog(`Match found with ${confidence.toFixed(1)}% confidence`);
    } else if (confidence < 40 && isMatched) {
      setIsMatched(false);
      if (overlayVideoRef.current) {
        overlayVideoRef.current.pause();
        setIsVideoPlaying(false);
      }
      setDebugInfo('❌ Match lost - Show image again');
      addLog('Match lost - video paused');
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [compareImages, isMatched, startVideo, addLog]);

  // Load content from Firebase with enhanced logging
  useEffect(() => {
    const loadContent = async () => {
      if (!contentKey) {
        setDebugInfo('❌ No content key found');
        addLog('Missing content key in URL');
        return;
      }

      try {
        setDebugInfo('🔄 Loading content...');
        addLog('Loading content from Firebase');

        const arContentRef = collection(db, 'arContent');
        const q = query(
          arContentRef,
          where('contentKey', '==', contentKey),
          where('isActive', '==', true)
        );

        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          setDebugInfo('❌ Invalid or inactive content');
          addLog('No active content found for key');
          return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();
        
        setVideoUrl(data.videoUrl);
        
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
          setDebugInfo('📸 Point camera at image');
          addLog('Reference image loaded successfully');
        };

      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`❌ Error: ${error.message}`);
        addLog('Error loading content: ' + error.message);
      }
    };

    loadContent();
  }, [contentKey, addLog]);

  // Initialize camera with enhanced feedback
  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      try {
        setDebugInfo('🎥 Starting camera...');
        addLog('Requesting camera access');

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
          setDebugInfo('🔍 Scanning for image...');
          addLog('Camera started successfully');
          animationFrameRef.current = requestAnimationFrame(processFrame);
        }
      } catch (error) {
        console.error('Camera error:', error);
        setDebugInfo(`❌ Camera error: ${error.message}`);
        addLog('Camera error: ' + error.message);
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
  }, [imageUrl, videoUrl, processFrame, addLog]);

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
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
      />

      {/* Scanning overlay */}
      <div className={`absolute inset-0 border-2 border-green-500 opacity-50 ${scanning ? 'animate-pulse' : ''}`}>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4/5 h-4/5 border-2 border-green-500"></div>
      </div>

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

      {/* Enhanced debug info panel */}
      <div className="absolute top-5 left-5 right-5 bg-black/80 text-white p-4 rounded-lg shadow-lg">
        <div className="text-lg font-bold mb-2">{debugInfo}</div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>Image Loaded: {imageLoaded ? '✅' : '❌'}</div>
          <div>Camera Active: {videoRef.current?.srcObject ? '✅' : '❌'}</div>
          <div>Match Found: {isMatched ? '✅' : '❌'}</div>
          <div>Match Confidence: {matchConfidence.toFixed(1)}%</div>
        </div>
        <div className="mt-2 p-2 bg-black/50 rounded text-xs">
          <div className="font-bold mb-1">Recent Activity:</div>
          {detailedLogs.map((log, index) => (
            <div key={index} className="opacity-70">
              [{log.time}] {log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;