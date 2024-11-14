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
  const referenceImageRef = useRef(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [canvasPosition, setCanvasPosition] = useState({ x: 50, y: 50 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isCanvasDetected, setIsCanvasDetected] = useState(false);
  const [matchScore, setMatchScore] = useState(0);

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

  const compareImages = useCallback((imgData1, imgData2) => {
    const width = Math.min(imgData1.width, imgData2.width);
    const height = Math.min(imgData1.height, imgData2.height);
    const blockSize = 16;
    const numBlocksX = Math.floor(width / blockSize);
    const numBlocksY = Math.floor(height / blockSize);
    
    let totalMatch = 0;
    let totalBlocks = numBlocksX * numBlocksY;

    for (let blockY = 0; blockY < numBlocksY; blockY++) {
      for (let blockX = 0; blockX < numBlocksX; blockX++) {
        let blockAvg1 = [0, 0, 0];
        let blockAvg2 = [0, 0, 0];
        let pixelCount = 0;

        for (let y = 0; y < blockSize; y++) {
          for (let x = 0; x < blockSize; x++) {
            const pixelX = blockX * blockSize + x;
            const pixelY = blockY * blockSize + y;
            const i = (pixelY * width + pixelX) * 4;

            blockAvg1[0] += imgData1.data[i];
            blockAvg1[1] += imgData1.data[i + 1];
            blockAvg1[2] += imgData1.data[i + 2];

            blockAvg2[0] += imgData2.data[i];
            blockAvg2[1] += imgData2.data[i + 1];
            blockAvg2[2] += imgData2.data[i + 2];

            pixelCount++;
          }
        }

        blockAvg1 = blockAvg1.map(sum => sum / pixelCount);
        blockAvg2 = blockAvg2.map(sum => sum / pixelCount);

        const colorDiff = Math.sqrt(
          Math.pow(blockAvg1[0] - blockAvg2[0], 2) +
          Math.pow(blockAvg1[1] - blockAvg2[1], 2) +
          Math.pow(blockAvg1[2] - blockAvg2[2], 2)
        );

        const threshold = 50;
        if (colorDiff < threshold) {
          totalMatch++;
        }
      }
    }

    return (totalMatch / totalBlocks) * 100;
  }, []);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !referenceImageRef.current) {
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
    const currentFrame = context.getImageData(0, 0, canvas.width, canvas.height);
    
    context.drawImage(referenceImageRef.current, 0, 0, canvas.width, canvas.height);
    const referenceFrame = context.getImageData(0, 0, canvas.width, canvas.height);
    
    const score = compareImages(currentFrame, referenceFrame);
    setMatchScore(score);

    if (score > 60) {  // Lowered threshold for better detection
      if (!isCanvasDetected) {
        setIsCanvasDetected(true);
        startVideo();
      }
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      setCanvasPosition({
        x: (centerX / canvas.width) * 100,
        y: (centerY / canvas.height) * 100
      });
      setCanvasSize({
        width: canvas.width * 0.8,
        height: canvas.height * 0.8
      });
    } else if (isCanvasDetected) {
      setIsCanvasDetected(false);
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [isCanvasDetected, startVideo, compareImages]);

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

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          referenceImageRef.current = img;
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

      {videoUrl && isCanvasDetected && (
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
        <div>Match Score: {matchScore.toFixed(1)}%</div>
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