import React, { useRef, useState, useEffect, useCallback } from 'react';
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
  const overlayVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const matchCanvasRef = useRef(null);
  const targetImageRef = useRef(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [isMatched, setIsMatched] = useState(false);

  // RGB to HSV conversion helper
  const rgbToHsv = useCallback((r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    let s = max === 0 ? 0 : diff / max;
    let v = max;

    if (diff !== 0) {
      switch (max) {
        case r:
          h = 60 * ((g - b) / diff + (g < b ? 6 : 0));
          break;
        case g:
          h = 60 * ((b - r) / diff + 2);
          break;
        case b:
          h = 60 * ((r - g) / diff + 4);
          break;
        default:
          break;
      }
    }

    return [h, s * 100, v * 100];
  }, []);

  const compareImages = useCallback((imgData1, imgData2) => {
    const width = imgData1.width;
    const height = imgData1.height;
    const blockSize = 16;
    
    const hueWeight = 0.4;
    const satWeight = 0.3;
    const valWeight = 0.3;
    
    const hueTolerance = 25;
    const satTolerance = 25;
    const valTolerance = 25;
    
    const MIN_BRIGHTNESS = 15;
    const MIN_SATURATION = 5;
    const BLOCK_MATCH_THRESHOLD = 0.5;
    
    let matchCount = 0;
    let totalBlocks = 0;
    let validBlockCount = 0;

    const getBlockAverageHSV = (imgData, startX, startY) => {
      let hSum = 0, sSum = 0, vSum = 0;
      let pixelCount = 0;

      for (let y = 0; y < blockSize && startY + y < height; y++) {
        for (let x = 0; x < blockSize && startX + x < width; x++) {
          const i = ((startY + y) * width + (startX + x)) * 4;
          const r = imgData.data[i];
          const g = imgData.data[i + 1];
          const b = imgData.data[i + 2];
          
          const [h, s, v] = rgbToHsv(r, g, b);
          hSum += h;
          sSum += s;
          vSum += v;
          pixelCount++;
        }
      }

      return pixelCount > 0 ? [
        hSum / pixelCount,
        sSum / pixelCount,
        vSum / pixelCount
      ] : [0, 0, 0];
    };

    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        const hsv1 = getBlockAverageHSV(imgData1, x, y);
        const hsv2 = getBlockAverageHSV(imgData2, x, y);

        if (hsv2[2] < MIN_BRIGHTNESS || hsv2[1] < MIN_SATURATION) {
          continue;
        }

        validBlockCount++;

        let hueDiff = Math.abs(hsv1[0] - hsv2[0]);
        if (hueDiff > 180) {
          hueDiff = 360 - hueDiff;
        }
        
        const satDiff = Math.abs(hsv1[1] - hsv2[1]);
        const valDiff = Math.abs(hsv1[2] - hsv2[2]);

        const hueMatch = Math.max(0, 1 - (hueDiff / hueTolerance));
        const satMatch = Math.max(0, 1 - (satDiff / satTolerance));
        const valMatch = Math.max(0, 1 - (valDiff / valTolerance));

        const blockMatchScore = 
          hueMatch * hueWeight +
          satMatch * satWeight +
          valMatch * valWeight;

        if (blockMatchScore > BLOCK_MATCH_THRESHOLD) {
          matchCount++;
        }

        totalBlocks++;
      }
    }

    const MIN_VALID_BLOCKS = Math.floor(totalBlocks * 0.15);
    if (validBlockCount < MIN_VALID_BLOCKS) {
      return 0;
    }

    const matchPercentage = (matchCount / validBlockCount) * 100;
    const scaledPercentage = Math.min(100, matchPercentage * 1.2);
    
    return Math.round(scaledPercentage);
  }, [rgbToHsv]);

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

  const processCameraFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !matchCanvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    canvas.width = matchCanvasRef.current.width;
    canvas.height = matchCanvasRef.current.height;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);
    const referenceFrame = matchCanvasRef.current.getContext('2d')
      .getImageData(0, 0, canvas.width, canvas.height);
    
    const similarity = compareImages(capturedFrame, referenceFrame);
    
    const MATCH_THRESHOLD = 65;
    const UNMATCH_THRESHOLD = 60;
    
    setDebugInfo(`Similarity: ${similarity.toFixed(1)}%`);

    if (similarity > MATCH_THRESHOLD && !isMatched) {
      setIsMatched(true);
      startVideo();
    } else if (similarity < UNMATCH_THRESHOLD && isMatched) {
      setIsMatched(false);
    }
  }, [compareImages, isMatched, startVideo]);

  const processTargetImage = useCallback((image) => {
    if (!matchCanvasRef.current) return;
    
    const canvas = matchCanvasRef.current;
    const ctx = canvas.getContext('2d');
    
    canvas.width = 640;
    canvas.height = 480;
    
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    setDebugInfo('Target image processed');
  }, []);

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
        setDebugInfo('Content loaded');
        
      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey]);

  useEffect(() => {
    if (!imageUrl) return;

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      targetImageRef.current = image;
      processTargetImage(image);
    };
    image.src = imageUrl;
  }, [imageUrl, processTargetImage]);

  useEffect(() => {
    let isComponentMounted = true;
    let currentStream = null;
    let frameProcessingInterval = null;

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
          setDebugInfo('Camera ready');
          
          frameProcessingInterval = setInterval(processCameraFrame, 500);
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
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
      if (frameProcessingInterval) {
        clearInterval(frameProcessingInterval);
      }
    };
  }, [videoUrl, processCameraFrame]);

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
    overlayVideo: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '40vw',
      height: '40vh',
      objectFit: 'contain',
      zIndex: 20,
      opacity: isMatched ? 1 : 0,
      transition: 'opacity 0.3s ease'
    },
    canvas: {
      display: 'none'
    },
    matchCanvas: {
      display: 'none'
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

      <canvas
        ref={matchCanvasRef}
        style={styles.matchCanvas}
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
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
        <div>Image Matched: {isMatched ? 'Yes' : 'No'}</div>
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