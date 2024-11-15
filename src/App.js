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

  // Store image in local storage
  const storeImage = async (key, imageUrl) => {
    try {
      console.log('Fetching image to store:', imageUrl);
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('Failed to fetch image');
      
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result;
          try {
            localStorage.setItem(`ar_image_${key}`, base64data);
            console.log('Image stored successfully');
            resolve(base64data);
          } catch (error) {
            console.error('Storage error:', error);
            reject(error);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error storing image:', error);
      throw error;
    }
  };

  // Pre-process image for comparison
  const preprocessImage = useCallback((img) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 320;
    canvas.height = 240;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, []);

  // Start video playback
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
      setDebugInfo('Click to play video with sound');
      
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

  // Compare images
  const compareImages = useCallback((imgData1, imgData2) => {
    if (!imgData1 || !imgData2) return 0;
    
    const width = imgData1.width;
    const height = imgData1.height;
    const blockSize = 8;
    
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

            // Simple color difference
            const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
            const match = diff < 150 ? 1 : 0;

            blockMatchSum += match;
            blockPixels++;
          }
        }

        if (blockPixels > 0 && (blockMatchSum / blockPixels) > 0.6) {
          matchCount++;
        }
        totalBlocks++;
      }
    }

    const score = totalBlocks > 0 ? Math.min(100, (matchCount / totalBlocks) * 100 * 1.5) : 0;
    console.log('Match score:', score.toFixed(1) + '%');
    return score;
  }, []);

  // Process video frames
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !processedImageRef.current) {
      requestAnimationFrame(processFrame);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (canvas.width !== 320 || canvas.height !== 240) {
      canvas.width = 320;
      canvas.height = 240;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrame = context.getImageData(0, 0, canvas.width, canvas.height);
    
    const score = compareImages(currentFrame, processedImageRef.current);
    setMatchScore(score);

    if (score > 70 && !isVideoPlaying) {
      startVideo();
    }

    requestAnimationFrame(processFrame);
  }, [compareImages, isVideoPlaying, startVideo]);

  // Load and process reference image
  const loadStoredImage = useCallback(async () => {
    const storedImage = localStorage.getItem(`ar_image_${contentKey}`);
    if (!storedImage) {
      console.log('No stored image found');
      return false;
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        processedImageRef.current = preprocessImage(img);
        console.log('Reference image processed');
        setImageLoaded(true);
        resolve(true);
      };
      img.onerror = (error) => {
        console.error('Error loading stored image:', error);
        resolve(false);
      };
      img.src = storedImage;
    });
  }, [preprocessImage, contentKey]);

  // Initialize camera
  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      try {
        console.log('Starting camera...');
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
          console.log('Camera started');
          requestAnimationFrame(processFrame);
          setDebugInfo('Camera ready - Show image');
        }
      } catch (error) {
        console.error('Camera error:', error);
        setDebugInfo(`Camera error: ${error.message}`);
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
        setDebugInfo('No content key found');
        return;
      }

      try {
        setDebugInfo('Loading content...');
        
        // Try loading from local storage first
        const loaded = await loadStoredImage();
        if (loaded) {
          setDebugInfo('Image loaded from storage');
          return;
        }

        // If not in storage, fetch from Firebase
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

        setVideoUrl(data.videoUrl);
        
        // Store and load image
        await storeImage(contentKey, data.imageUrl);
        await loadStoredImage();
        
        setDebugInfo('Content ready - Show image');

      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey, loadStoredImage]);

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
    </div>
  );
};

export default App;