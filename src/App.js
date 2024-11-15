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
  const processedImageRef = useRef(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [matchScore, setMatchScore] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Frame comparison using HSV values
  const compareFrames = useCallback((frame1, frame2) => {
    if (!frame1 || !frame2) return 0;

    const width = Math.min(frame1.width, frame2.width);
    const height = Math.min(frame1.height, frame2.height);
    const blockSize = 8;
    let matchCount = 0;
    let totalBlocks = 0;

    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        let blockMatch = 0;
        let blockTotal = 0;

        for (let by = 0; by < blockSize && y + by < height; by++) {
          for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
            const i = ((y + by) * width + (x + bx)) * 4;
            const r1 = frame1.data[i];
            const g1 = frame1.data[i + 1];
            const b1 = frame1.data[i + 2];
            const r2 = frame2.data[i];
            const g2 = frame2.data[i + 1];
            const b2 = frame2.data[i + 2];

            const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
            if (diff < 150) blockMatch++;
            blockTotal++;
          }
        }

        if (blockTotal > 0 && (blockMatch / blockTotal) > 0.6) {
          matchCount++;
        }
        totalBlocks++;
      }
    }

    return totalBlocks > 0 ? Math.min(100, (matchCount / totalBlocks) * 100 * 1.5) : 0;
  }, []);

  // Start video playback
  const startVideo = useCallback(async () => {
    if (!overlayVideoRef.current || !videoUrl || isVideoPlaying) return;

    try {
      overlayVideoRef.current.src = videoUrl;
      await overlayVideoRef.current.play();
      setIsVideoPlaying(true);
      setDebugInfo('Video playing');
    } catch (error) {
      console.error('Video playback error:', error);
      setDebugInfo('Click to play video');

      const playOnClick = () => {
        if (overlayVideoRef.current) {
          overlayVideoRef.current.play()
            .then(() => {
              setIsVideoPlaying(true);
              setDebugInfo('Video playing');
              document.removeEventListener('click', playOnClick);
            })
            .catch(console.error);
        }
      };
      document.addEventListener('click', playOnClick);
    }
  }, [videoUrl, isVideoPlaying]);

  // Process each frame
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !processedImageRef.current) {
      requestAnimationFrame(processFrame);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    canvas.width = 320;
    canvas.height = 240;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrame = context.getImageData(0, 0, canvas.width, canvas.height);

    const score = compareFrames(currentFrame, processedImageRef.current);
    setMatchScore(score);

    if (score > 70 && !isVideoPlaying) {
      startVideo();
    }

    requestAnimationFrame(processFrame);
  }, [compareFrames, isVideoPlaying, startVideo]);

  // Load reference image
  const loadReferenceImage = useCallback(async (imageUrl) => {
    try {
      const response = await fetch(imageUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('Failed to fetch image');
      
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = 320;
          canvas.height = 240;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          processedImageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
          setImageLoaded(true);
          resolve();
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
      });
    } catch (error) {
      console.error('Image loading error:', error);
      throw error;
    }
  }, []);

  // Start camera
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
          requestAnimationFrame(processFrame);
          setDebugInfo('Camera active');
        }
      } catch (error) {
        console.error('Camera error:', error);
        setDebugInfo('Camera error: ' + error.message);
      }
    };

    if (imageLoaded) {
      startCamera();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [processFrame, imageLoaded]);

  // Load content
  useEffect(() => {
    const loadContent = async () => {
      if (!contentKey) {
        setDebugInfo('No content key');
        return;
      }

      try {
        const arContentRef = collection(db, 'arContent');
        const q = query(
          arContentRef,
          where('contentKey', '==', contentKey),
          where('isActive', '==', true)
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          setDebugInfo('Invalid content key');
          return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        if (!data.imageUrl || !data.videoUrl) {
          setDebugInfo('Invalid content data');
          return;
        }

        setVideoUrl(data.videoUrl);
        await loadReferenceImage(data.imageUrl);
        setDebugInfo('Content loaded');
      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo('Error: ' + error.message);
      }
    };

    loadContent();
  }, [contentKey, loadReferenceImage]);

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
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '40vw',
      height: '40vh',
      objectFit: 'contain',
      zIndex: 20,
      opacity: matchScore > 70 ? 1 : 0,
      transition: 'opacity 0.3s ease-out'
    },
    debugInfo: {
      position: 'absolute',
      top: 20,
      left: 20,
      backgroundColor: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px'
    }
  };

  return (
    <div style={styles.container}>
      <video ref={videoRef} style={styles.video} autoPlay muted playsInline />
      <canvas ref={canvasRef} style={styles.canvas} />
      <video ref={overlayVideoRef} style={styles.overlayVideo} controls />
      <div style={styles.debugInfo}>Debug Info: {debugInfo} | Match Score: {matchScore.toFixed(2)}</div>
    </div>
  );
};

export default App;
