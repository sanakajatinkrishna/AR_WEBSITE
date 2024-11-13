import React, { useRef, useState, useCallback, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCTNhBokqTimxo-oGstSA8Zw8jIXO3Nhn4",
  authDomain: "app-1238f.firebaseapp.com",
  projectId: "app-1238f",
  storageBucket: "app-1238f.appspot.com",
  messagingSenderId: "12576842624",
  appId: "1:12576842624:web:92eb40fd8c56a9fc475765",
  measurementId: "G-N5Q9K9G3JN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const App = () => {
  const contentKey = new URLSearchParams(window.location.search).get('key');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const animationFrameRef = useRef(null);
  const trackedPositionRef = useRef({ x: 50, y: 50 });
  const referenceImageRef = useRef(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [canvasPosition, setCanvasPosition] = useState({ x: 50, y: 50 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isCanvasDetected, setIsCanvasDetected] = useState(false);
  const [matchPercentage, setMatchPercentage] = useState(0);

  const calculateImageMatch = useCallback((capturedImageData, referenceCanvas) => {
    if (!referenceCanvas) return 0;

    const refCtx = referenceCanvas.getContext('2d');
    const refImageData = refCtx.getImageData(0, 0, referenceCanvas.width, referenceCanvas.height);
    
    let matchingPixels = 0;
    const totalPixels = capturedImageData.width * capturedImageData.height;
    
    // Compare every 4th pixel (RGBA values)
    for (let i = 0; i < capturedImageData.data.length; i += 16) {
      const capturedR = capturedImageData.data[i];
      const capturedG = capturedImageData.data[i + 1];
      const capturedB = capturedImageData.data[i + 2];
      
      const refR = refImageData.data[i];
      const refG = refImageData.data[i + 1];
      const refB = refImageData.data[i + 2];
      
      // Calculate color difference
      const colorDiff = Math.sqrt(
        Math.pow(capturedR - refR, 2) +
        Math.pow(capturedG - refG, 2) +
        Math.pow(capturedB - refB, 2)
      );
      
      // If colors are similar enough
      if (colorDiff < 100) {
        matchingPixels++;
      }
    }
    
    return (matchingPixels / (totalPixels / 4)) * 100;
  }, []);

  const detectCanvas = useCallback((imageData) => {
    if (!referenceImageRef.current) return { detected: false };

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    tempCtx.putImageData(imageData, 0, 0);

    const match = calculateImageMatch(imageData, referenceImageRef.current);
    setMatchPercentage(Math.round(match));

    if (match >= 50) {
      const centerX = imageData.width / 2;
      const centerY = imageData.height / 2;
      
      const posX = (centerX / imageData.width) * 100;
      const posY = (centerY / imageData.height) * 100;
      
      trackedPositionRef.current.x = trackedPositionRef.current.x * 0.8 + posX * 0.2;
      trackedPositionRef.current.y = trackedPositionRef.current.y * 0.8 + posY * 0.2;

      return {
        position: { x: trackedPositionRef.current.x, y: trackedPositionRef.current.y },
        size: { width: imageData.width * 0.5, height: imageData.height * 0.5 },
        detected: true
      };
    }

    return { detected: false };
  }, [calculateImageMatch]);

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
    
    if (result.detected && matchPercentage >= 50) {
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
  }, [detectCanvas, startVideo, isCanvasDetected, matchPercentage]);

  useEffect(() => {
    const loadContent = async () => {
      if (!contentKey) {
        setDebugInfo('No content key found');
        return;
      }

      try {
        setDebugInfo('Verifying content...');

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
        
        // Load reference image
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 300;
          canvas.height = 300;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, 300, 300);
          referenceImageRef.current = canvas;
          setDebugInfo('Content loaded - Please show image');
        };
        img.src = data.imageUrl;

      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey]);

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
    referenceImage: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      width: '150px',
      height: '150px',
      objectFit: 'contain',
      borderRadius: '5px',
      opacity: 0.7,
      zIndex: 30,
      backgroundColor: 'rgba(0,0,0,0.3)',
      padding: '5px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      border: '1px solid rgba(255,255,255,0.2)'
    },
    matchIndicator: {
      position: 'absolute',
      top: 20,
      right: 20,
      backgroundColor: matchPercentage >= 50 ? 'rgba(0,255,0,0.7)' : 'rgba(255,0,0,0.7)',
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

      {videoUrl && isCanvasDetected && matchPercentage >= 50 && (
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

      <div style={styles.matchIndicator}>
        Match: {matchPercentage}%
      </div>

      {imageUrl && (
        <img 
          src={imageUrl}
          alt="AR marker to scan"
          style={styles.referenceImage}
        />
      )}
    </div>
  );
};

export default App;