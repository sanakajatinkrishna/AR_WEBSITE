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
  
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [isMatched, setIsMatched] = useState(false);
  const [matchConfidence, setMatchConfidence] = useState(0);

  // Start video playback
  const startVideo = useCallback(async () => {
    if (!overlayVideoRef.current || !videoUrl || isVideoPlaying) return;

    try {
      overlayVideoRef.current.src = videoUrl;
      overlayVideoRef.current.muted = false;
      await overlayVideoRef.current.play();
      setIsVideoPlaying(true);
    } catch (error) {
      console.error('Video playback error:', error);
      setDebugInfo('Click to play video with sound');
    }
  }, [videoUrl, isVideoPlaying]);

  // Image matching helper functions
  const calculateHistogram = (imageData) => {
    const hist = Array(256).fill(0);
    for (let i = 0; i < imageData.length; i += 4) {
      const brightness = Math.floor((imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3);
      hist[brightness]++;
    }
    return hist;
  };

  const compareHistograms = (hist1, hist2) => {
    let difference = 0;
    const total = hist1.reduce((a, b) => a + b, 0);
    
    for (let i = 0; i < 256; i++) {
      const h1 = hist1[i] / total;
      const h2 = hist2[i] / total;
      difference += Math.abs(h1 - h2);
    }
    
    return difference / 2;
  };

  // Image comparison function
  const compareImages = useCallback((sourceImageData, targetImageData) => {
    const sourceData = sourceImageData.data;
    const targetData = targetImageData.data;
    
    // Calculate average colors for both images
    let sourceTotals = [0, 0, 0];
    let targetTotals = [0, 0, 0];
    
    for (let i = 0; i < sourceData.length; i += 4) {
      sourceTotals[0] += sourceData[i];
      sourceTotals[1] += sourceData[i + 1];
      sourceTotals[2] += sourceData[i + 2];
      
      targetTotals[0] += targetData[i];
      targetTotals[1] += targetData[i + 1];
      targetTotals[2] += targetData[i + 2];
    }
    
    const pixelCount = sourceData.length / 4;
    const sourceAvg = sourceTotals.map(total => total / pixelCount);
    const targetAvg = targetTotals.map(total => total / pixelCount);
    
    // Calculate color difference
    let difference = 0;
    for (let i = 0; i < 3; i++) {
      difference += Math.abs(sourceAvg[i] - targetAvg[i]);
    }
    
    // Calculate histogram difference
    const sourceHist = calculateHistogram(sourceData);
    const targetHist = calculateHistogram(targetData);
    const histDiff = compareHistograms(sourceHist, targetHist);
    
    // Combined confidence score (0-100)
    const colorConfidence = Math.max(0, 100 - (difference / 7.65));
    const histConfidence = Math.max(0, 100 - (histDiff * 100));
    
    return (colorConfidence * 0.4 + histConfidence * 0.6);
  }, []);

  // Process video frames
  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const refCanvas = referenceCanvasRef.current;

    if (!video || !canvas || !refCanvas || !referenceImageRef.current) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    context.drawImage(video, 0, 0);
    
    // Get center portion of camera feed
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
    
    // Update match status and play video if confidence is high enough
    if (confidence > 50 && !isMatched) {
      setIsMatched(true);
      startVideo();
    } else if (confidence < 40 && isMatched) {
      setIsMatched(false);
      if (overlayVideoRef.current) {
        overlayVideoRef.current.pause();
      }
    }

    setDebugInfo(`Match confidence: ${confidence.toFixed(1)}%`);
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
        console.log('Loading content for key:', contentKey);
        setDebugInfo('Loading content...');

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
        
        setVideoUrl(data.videoUrl);
        setImageUrl(data.imageUrl);
        setDebugInfo('Content loaded - Please show image');

        // Load reference image
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = data.imageUrl;
        img.onload = () => {
          referenceImageRef.current = img;
          const canvas = referenceCanvasRef.current;
          const ctx = canvas.getContext('2d');
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
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
        <div>Match: {isMatched ? 'Yes' : 'No'}</div>
        <div>Confidence: {matchConfidence.toFixed(1)}%</div>
      </div>
    </div>
  );
};

export default App;