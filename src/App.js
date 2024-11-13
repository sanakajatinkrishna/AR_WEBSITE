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
  // Get content key directly from URL
  const contentKey = new URLSearchParams(window.location.search).get('key');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const markerImageRef = useRef(null);
  const markerFeaturesRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastPositionRef = useRef({ x: 50, y: 50 });

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [markerUrl, setMarkerUrl] = useState(null);
  const [canvasPosition, setCanvasPosition] = useState({ x: 50, y: 50 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isMarkerDetected, setIsMarkerDetected] = useState(false);

  // Calculate feature descriptor for matching
  const calculateDescriptor = useCallback((data, width, x, y) => {
    const descriptor = new Uint8Array(32);
    const step = 4;
    
    for (let i = 0; i < 32; i++) {
      const x1 = x + Math.cos(i * Math.PI / 16) * step;
      const y1 = y + Math.sin(i * Math.PI / 16) * step;
      const x2 = x - Math.cos(i * Math.PI / 16) * step;
      const y2 = y - Math.sin(i * Math.PI / 16) * step;
      
      const i1 = ((y1 | 0) * width + (x1 | 0)) * 4;
      const i2 = ((y2 | 0) * width + (x2 | 0)) * 4;
      
      descriptor[i] = (data[i1] + data[i1 + 1] + data[i1 + 2]) / 3 > 
                     (data[i2] + data[i2 + 1] + data[i2 + 2]) / 3 ? 1 : 0;
    }
    
    return descriptor;
  }, []);

  // Extract features from image data
  const extractFeatures = useCallback((imageData) => {
    const features = [];
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const threshold = 30;
    
    // Sample points in a grid pattern for efficiency
    for (let y = 20; y < height - 20; y += 10) {
      for (let x = 20; x < width - 20; x += 10) {
        const i = (y * width + x) * 4;
        const centerValue = (data[i] + data[i + 1] + data[i + 2]) / 3;
        
        // Calculate gradient
        const dx = (data[i + 4] + data[i + 5] + data[i + 6]) / 3 - centerValue;
        const dy = (data[i + width * 4] + data[i + width * 4 + 1] + data[i + width * 4 + 2]) / 3 - centerValue;
        
        // Store strong feature points
        if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
          features.push({
            x,
            y,
            value: centerValue,
            descriptor: calculateDescriptor(data, width, x, y)
          });
        }
      }
    }
    
    return features;
  }, [calculateDescriptor]);

  // Load reference marker image and extract features
  useEffect(() => {
    if (!markerUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      // Store marker features for matching
      markerImageRef.current = img;
      markerFeaturesRef.current = extractFeatures(ctx.getImageData(0, 0, img.width, img.height));
    };
    img.src = markerUrl;
  }, [markerUrl, extractFeatures]);

  // Match features between two sets
  const matchFeatures = useCallback((features1, features2) => {
    const matches = [];
    const threshold = 0.7;
    
    for (const f1 of features1) {
      let bestDist = Infinity;
      let bestMatch = null;
      
      for (const f2 of features2) {
        let dist = 0;
        for (let i = 0; i < f1.descriptor.length; i++) {
          if (f1.descriptor[i] !== f2.descriptor[i]) dist++;
        }
        
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = f2;
        }
      }
      
      if (bestDist < threshold * f1.descriptor.length) {
        matches.push({ point1: f1, point2: bestMatch });
      }
    }
    
    return matches;
  }, []);

  // Calculate transformation from matches
  const calculateTransform = useCallback((matches) => {
    if (matches.length < 10) return null;
    
    // Calculate centroid
    let sumX1 = 0, sumY1 = 0, sumX2 = 0, sumY2 = 0;
    matches.forEach(m => {
      sumX1 += m.point1.x;
      sumY1 += m.point1.y;
      sumX2 += m.point2.x;
      sumY2 += m.point2.y;
    });
    
    const centerX1 = sumX1 / matches.length;
    const centerY1 = sumY1 / matches.length;
    const centerX2 = sumX2 / matches.length;
    const centerY2 = sumY2 / matches.length;
    
    // Calculate scale and rotation
    let numerator = 0, denominator = 0;
    matches.forEach(m => {
      const dx1 = m.point1.x - centerX1;
      const dy1 = m.point1.y - centerY1;
      const dx2 = m.point2.x - centerX2;
      const dy2 = m.point2.y - centerY2;
      
      numerator += dx1 * dx2 + dy1 * dy2;
      denominator += dx1 * dx1 + dy1 * dy1;
    });
    
    const scale = Math.sqrt(denominator ? numerator / denominator : 0);
    
    return {
      x: centerX2,
      y: centerY2,
      scale: scale,
      confidence: matches.length
    };
  }, []);

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

        const arContentRef = collection(db, 'arExperiences');
        const q = query(arContentRef, where('experienceId', '==', contentKey));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          setDebugInfo('Content not found');
          return;
        }

        const data = snapshot.docs[0].data();
        setVideoUrl(data.videoUrl);
        setMarkerUrl(data.markerUrl);
        setDebugInfo('Content loaded - Show marker image');

      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey]);

  // Start video playback
  const startVideo = useCallback(async () => {
    if (!overlayVideoRef.current || !videoUrl || isVideoPlaying) return;

    try {
      overlayVideoRef.current.src = videoUrl;
      overlayVideoRef.current.muted = false;
      await overlayVideoRef.current.play();
      setIsVideoPlaying(true);
      setDebugInfo('Video playing');
    } catch (error) {
      console.error('Video playback error:', error);
      setDebugInfo('Tap to play video');
      
      const playOnClick = () => {
        overlayVideoRef.current?.play()
          .then(() => {
            setIsVideoPlaying(true);
            setDebugInfo('Video playing');
            document.removeEventListener('click', playOnClick);
          })
          .catch(console.error);
      };
      document.addEventListener('click', playOnClick);
    }
  }, [videoUrl, isVideoPlaying]);

  // Process video frame
  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !markerFeaturesRef.current) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const context = canvas.getContext('2d', { 
      willReadFrequently: true,
      alpha: false 
    });

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    context.drawImage(video, 0, 0);
    
    // Process center region for efficiency
    const centerWidth = canvas.width * 0.6;
    const centerHeight = canvas.height * 0.6;
    const x = (canvas.width - centerWidth) / 2;
    const y = (canvas.height - centerHeight) / 2;
    
    const frameImageData = context.getImageData(x, y, centerWidth, centerHeight);
    const frameFeatures = extractFeatures(frameImageData);
    
    // Match features
    const matches = matchFeatures(markerFeaturesRef.current, frameFeatures);
    const transform = calculateTransform(matches);
    
    if (transform && transform.confidence >= 10) {
      const markerAspectRatio = markerImageRef.current.height / markerImageRef.current.width;
      const targetWidth = Math.min(transform.scale * 100, 40);
      const targetHeight = targetWidth * markerAspectRatio;

      // Smooth position updates using lastPositionRef
      const newX = (transform.x / centerWidth) * 100;
      const newY = (transform.y / centerHeight) * 100;
      
      lastPositionRef.current = {
        x: lastPositionRef.current.x * 0.8 + newX * 0.2,
        y: lastPositionRef.current.y * 0.8 + newY * 0.2
      };
      
      setCanvasPosition(lastPositionRef.current);
      setCanvasSize({
        width: targetWidth,
        height: targetHeight
      });
      
      if (!isMarkerDetected) {
        setIsMarkerDetected(true);
        startVideo();
      }
    } else if (isMarkerDetected) {
      setIsMarkerDetected(false);
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [extractFeatures, matchFeatures, calculateTransform, startVideo, isMarkerDetected]);

  // Initialize camera
  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const track = stream.getVideoTracks()[0];
          
          // Optimize camera settings
          await track.applyConstraints({
            advanced: [
              { exposureMode: "continuous" },
              { focusMode: "continuous" },
              { whiteBalanceMode: "continuous" }
            ]
          }).catch(() => {});

          await videoRef.current.play();
          setDebugInfo('Camera ready - Show marker image');
          processFrame();
        }
      } catch (error) {
        console.error('Camera error:', error);
        setDebugInfo(`Camera error: ${error.message}`);
      }
    };

    if (markerUrl) {
      startCamera();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [markerUrl, processFrame]);

  const styles = {
    container: {
      position: 'fixed',
      inset: 0,
      backgroundColor: 'black'
    },
    video: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    },
    canvas: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      display: 'none'
    },
    overlayVideo: {
      position: 'absolute',
      top: `${canvasPosition.y}%`,
      left: `${canvasPosition.x}%`,
      transform: 'translate(-50%, -50%)',
      width: `${canvasSize.width}vw`,
      height: `${canvasSize.height}vh`,
      objectFit: 'contain',
      zIndex: 20,
      transition: 'all 0.1s ease-out',
      display: isMarkerDetected ? 'block' : 'none'
    },
    debugInfo: {
      position: 'absolute',
      top: 20,
      left: 20,
      backgroundColor: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 30
    }
  };

  return (
    <div style={styles.container}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={styles.video}
      />

      <canvas
        ref={canvasRef}
        style={styles.canvas}
      />

      {videoUrl && (
        <video
          ref={overlayVideoRef}
          style={styles.overlayVideo}
          autoPlay
          playsInline
          loop
          muted={false}
          controls={false}
        />
      )}

      <div style={styles.debugInfo}>
        <div>Status: {debugInfo}</div>
        <div>Content Key: {contentKey || 'Not found'}</div>
        <div>Camera Active: {videoRef.current?.srcObject ? 'Yes' : 'No'}</div>
        <div>Marker Detected: {isMarkerDetected ? 'Yes' : 'No'}</div>
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
        {isMarkerDetected && (
          <>
            <div>Position: {Math.round(canvasPosition.x)}%, {Math.round(canvasPosition.y)}%</div>
            <div>Size: {Math.round(canvasSize.width)}vw x {Math.round(canvasSize.height)}vh</div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;