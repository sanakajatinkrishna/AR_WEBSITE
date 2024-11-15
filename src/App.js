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
  const animationFrameRef = useRef(null);
  const trackedPositionRef = useRef({ x: 50, y: 50 });

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [canvasPosition, setCanvasPosition] = useState({ x: 50, y: 50 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isCanvasDetected, setIsCanvasDetected] = useState(false);

  // Load content based on key
  useEffect(() => {
    const loadContent = async () => {
      if (!contentKey) {
        setDebugInfo('No content key found');
        return;
      }

      try {
        console.log('Loading content for key:', contentKey);
        setDebugInfo('Verifying content...');

        const arContentRef = collection(db, 'arContent');
        const q = query(
          arContentRef,
          where('contentKey', '==', contentKey),
          where('isActive', '==', true)
        );

        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          console.log('No content found');
          setDebugInfo('Invalid or inactive content');
          return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();
        console.log('Content found:', data);

        setVideoUrl(data.videoUrl);
        setImageUrl(data.imageUrl);
        setDebugInfo('Content loaded - Please show image');

      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey]);

  const detectCanvas = useCallback((imageData) => {
    const width = imageData.width;
    const height = imageData.height;
    
    let totalR = 0, totalG = 0, totalB = 0;
    let samples = 0;

    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const i = (y * width + x) * 4;
        totalR += imageData.data[i];
        totalG += imageData.data[i + 1];
        totalB += imageData.data[i + 2];
        samples++;
      }
    }

    const avgR = totalR / samples;
    const avgG = totalG / samples;
    const avgB = totalB / samples;

    const hasContent = (avgR > 30 || avgG > 30 || avgB > 30) && 
                      (avgR < 240 || avgG < 240 || avgB < 240);

    if (hasContent) {
      let left = width, right = 0, top = height, bottom = 0;

      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          const i = (y * width + x) * 4;
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];

          if (Math.abs(r - avgR) > 20 || Math.abs(g - avgG) > 20 || Math.abs(b - avgB) > 20) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }

      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      const objWidth = right - left;
      const objHeight = bottom - top;

      const posX = (centerX / width) * 100;
      const posY = (centerY / height) * 100;

      trackedPositionRef.current.x = trackedPositionRef.current.x * 0.8 + posX * 0.2;
      trackedPositionRef.current.y = trackedPositionRef.current.y * 0.8 + posY * 0.2;

      return {
        position: { x: trackedPositionRef.current.x, y: trackedPositionRef.current.y },
        size: { width: objWidth, height: objHeight },
        detected: true
      };
    }

    return { detected: false };
  }, []);

  const startVideo = useCallback(async () => {
    if (!overlayVideoRef.current || !videoUrl || isVideoPlaying) return;

    try {
      overlayVideoRef.current.src = videoUrl;
      overlayVideoRef.current.muted = false;
      await overlayVideoRef.current.play();
      setIsVideoPlaying(true);
      setDebugInfo('Video playing with sound');
    } catch (error) {
      console.error('Video playback error:', error);
      setDebugInfo('Click anywhere to play video with sound');
      
      const playOnClick = () => {
        if (overlayVideoRef.current) {
          overlayVideoRef.current.play()
            .then(() => {
              setIsVideoPlaying(true);
              setDebugInfo('Video playing with sound');
              document.removeEventListener('click', playOnClick);
            })
            .catch(console.error);
        }
      };
      document.addEventListener('click', playOnClick);
    }
  }, [videoUrl, isVideoPlaying]);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
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
    
    const centerWidth = canvas.width * 0.5;
    const centerHeight = canvas.height * 0.5;
    const x = (canvas.width - centerWidth) / 2;
    const y = (canvas.height - centerHeight) / 2;
    
    const imageData = context.getImageData(x, y, centerWidth, centerHeight);
    const result = detectCanvas(imageData);
    
    if (result.detected) {
      setCanvasPosition(result.position);
      setCanvasSize(result.size);
      
      if (!isCanvasDetected) {
        setIsCanvasDetected(true);
        startVideo();
      }
    } else if (isCanvasDetected) {
      setIsCanvasDetected(false);
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [detectCanvas, startVideo, isCanvasDetected]);

  useEffect(() => {
    let isComponentMounted = true;
    let currentStream = null;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        });

        if (!isComponentMounted) return;

        const videoTrack = stream.getVideoTracks()[0];
        await videoTrack.applyConstraints({
          advanced: [
            { exposureMode: "continuous" },
            { focusMode: "continuous" },
            { whiteBalanceMode: "continuous" }
          ]
        }).catch(() => {});

        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          console.log('Camera started');
          
          if (isComponentMounted) {
            setDebugInfo('Camera ready - Show image');
            animationFrameRef.current = requestAnimationFrame(processFrame);
          }
        }
      } catch (error) {
        console.error('Camera error:', error);
        if (isComponentMounted) {
          setDebugInfo(`Camera error: ${error.message}`);
        }
      }
    };

    if (videoUrl) {
      console.log('Starting camera');
      startCamera();
    }

    return () => {
      isComponentMounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [processFrame, videoUrl]);

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
      width: `${Math.min(canvasSize.width * 1.2, 40)}vw`,
      height: `${Math.min(canvasSize.height * 1.2, 40)}vh`,
      objectFit: 'contain',
      zIndex: 20,
      transition: 'all 0.1s ease-out'
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
    },
    imagePreview: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 30
    },
    previewImage: {
      width: '150px',
      height: '150px',
      objectFit: 'cover',
      borderRadius: '5px'
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
        <div>Key: {contentKey || 'Not found'}</div>
        <div>Camera Active: {videoRef.current?.srcObject ? 'Yes' : 'No'}</div>
        <div>Canvas Detected: {isCanvasDetected ? 'Yes' : 'No'}</div>
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
      </div>

      {imageUrl && (
        <div style={styles.imagePreview}>
          <img src={imageUrl} alt="Target" style={styles.previewImage} />
        </div>
      )}
    </div>
  );
};

export default App;
