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
  const referenceImageRef = useRef(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [matchScore, setMatchScore] = useState(0);

  // RGB to HSV conversion for better comparison
  const rgbToHsv = (r, g, b) => {
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
        case r: h = 60 * ((g - b) / diff + (g < b ? 6 : 0)); break;
        case g: h = 60 * ((b - r) / diff + 2); break;
        case b: h = 60 * ((r - g) / diff + 4); break;
        default: break;
      }
    }
    
    return [h, s * 100, v * 100];
  };

  // Compare images using HSV color space
  const compareImages = useCallback((imgData1, imgData2) => {
    if (!imgData1 || !imgData2) return 0;
    
    const width = Math.min(imgData1.width, imgData2.width);
    const height = Math.min(imgData1.height, imgData2.height);
    const blockSize = 8;
    const hueWeight = 0.5;
    const satWeight = 0.3;
    const valWeight = 0.2;
    const hueTolerance = 30;
    const satTolerance = 30;
    const valTolerance = 30;
    
    let matchCount = 0;
    let totalBlocks = 0;

    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        let blockMatchSum = 0;
        let blockPixels = 0;

        for (let by = 0; by < blockSize && y + by < height; by++) {
          for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
            const i = ((y + by) * width + (x + bx)) * 4;
            
            const r1 = imgData1.data[i];
            const g1 = imgData1.data[i + 1];
            const b1 = imgData1.data[i + 2];
            
            const r2 = imgData2.data[i];
            const g2 = imgData2.data[i + 1];
            const b2 = imgData2.data[i + 2];

            const hsv1 = rgbToHsv(r1, g1, b1);
            const hsv2 = rgbToHsv(r2, g2, b2);

            const hueDiff = Math.abs(hsv1[0] - hsv2[0]);
            const satDiff = Math.abs(hsv1[1] - hsv2[1]);
            const valDiff = Math.abs(hsv1[2] - hsv2[2]);

            const hueMatch = (hueDiff <= hueTolerance || hueDiff >= 360 - hueTolerance) ? 1 : 0;
            const satMatch = satDiff <= satTolerance ? 1 : 0;
            const valMatch = valDiff <= valTolerance ? 1 : 0;

            const pixelMatchScore = 
              hueMatch * hueWeight +
              satMatch * satWeight +
              valMatch * valWeight;

            blockMatchSum += pixelMatchScore;
            blockPixels++;
          }
        }

        if (blockPixels > 0 && (blockMatchSum / blockPixels) > 0.6) {
          matchCount++;
        }
        totalBlocks++;
      }
    }

    return totalBlocks > 0 ? Math.min(100, (matchCount / totalBlocks) * 100 * 1.5) : 0;
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

  if (!video || !canvas || !video.videoWidth || !referenceImageRef.current) {
    requestAnimationFrame(processFrame);
    return;
  }

  const context = canvas.getContext('2d', { willReadFrequently: true });

  // Ensure canvas matches video dimensions
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  
  // Draw current video frame
  context.drawImage(video, 0, 0);
  
  // Get current frame data
  const currentFrame = context.getImageData(0, 0, canvas.width, canvas.height);
  
  // Compare with reference image
  const score = compareImages(currentFrame, referenceImageRef.current);
  setMatchScore(score);

  // Start video playback if match score is high enough
  if (score > 70 && !isVideoPlaying) {
    startVideo();
  }

  requestAnimationFrame(processFrame);
}, [compareImages, isVideoPlaying, startVideo]);



  // Load reference image
  const loadReferenceImage = useCallback(async (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 320;  // Standard size for comparison
        canvas.height = 240;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        referenceImageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve();
      };
      
      img.onerror = reject;
      img.src = url;
    });
  }, []);

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
          requestAnimationFrame(processFrame);
          setDebugInfo('Camera ready - Show image');
        }
      } catch (error) {
        console.error('Camera error:', error);
        setDebugInfo(`Camera error: ${error.message}`);
      }
    };

    if (videoUrl) {
      startCamera();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [processFrame, videoUrl]);

  // Load content from Firebase
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
        
        await loadReferenceImage(data.imageUrl);
        setDebugInfo('Content loaded - Please show image');

      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey, loadReferenceImage]);

  // Styles
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
        <div>Match Score: {matchScore.toFixed(1)}%</div>
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
      </div>

      {imageUrl && (
        <div style={styles.imagePreview}>
          <img 
            src={imageUrl} 
            alt="Target" 
            style={styles.previewImage}
          />
        </div>
      )}
    </div>
  );
};

export default App;