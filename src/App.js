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

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [isMatched, setIsMatched] = useState(false);

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
        case r: h = ((g - b) / diff) % 6; break;
        case g: h = (b - r) / diff + 2; break;
        case b: h = (r - g) / diff + 4; break;
        default: h = 0 ; break;
      }
    }

    h = Math.round(h * 60);
    if (h < 0) h += 360;

    return [h, Math.round(s * 100), Math.round(v * 100)];
  };

  const compareImages = useCallback((cameraData, targetData) => {
    const width = targetData.width;
    const height = targetData.height;
    const blockSize = 8;
    const hueWeight = 0.5;
    const satWeight = 0.3;
    const valWeight = 0.2;
    const hueTolerance = 30;
    const satTolerance = 30;
    const valTolerance = 30;

    let bestMatchScore = 0;

    // Scan through the camera frame to find the target image
    const stepSize = Math.max(1, Math.floor(blockSize / 2)); // Overlap scanning for better matching

    for (let offsetY = 0; offsetY <= cameraData.height - height; offsetY += stepSize) {
      for (let offsetX = 0; offsetX <= cameraData.width - width; offsetX += stepSize) {
        let matchCount = 0;
        let totalBlocks = 0;

        // Compare blocks of pixels
        for (let y = 0; y < height; y += blockSize) {
          for (let x = 0; x < width; x += blockSize) {
            let blockMatchSum = 0;
            let blockPixels = 0;

            // Sample pixels within block
            for (let by = 0; by < blockSize && y + by < height; by++) {
              for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
                const targetI = ((y + by) * width + (x + bx)) * 4;
                const cameraI = (((offsetY + y + by) * cameraData.width) + (offsetX + x + bx)) * 4;

                if (cameraI < cameraData.data.length - 4 && targetI < targetData.data.length - 4) {
                  // Get RGB values
                  const rt = targetData.data[targetI];
                  const gt = targetData.data[targetI + 1];
                  const bt = targetData.data[targetI + 2];

                  const rc = cameraData.data[cameraI];
                  const gc = cameraData.data[cameraI + 1];
                  const bc = cameraData.data[cameraI + 2];

                  // Convert to HSV
                  const hsvTarget = rgbToHsv(rt, gt, bt);
                  const hsvCamera = rgbToHsv(rc, gc, bc);

                  // Compare HSV values
                  const hueDiff = Math.min(
                    Math.abs(hsvTarget[0] - hsvCamera[0]),
                    360 - Math.abs(hsvTarget[0] - hsvCamera[0])
                  );
                  const satDiff = Math.abs(hsvTarget[1] - hsvCamera[1]);
                  const valDiff = Math.abs(hsvTarget[2] - hsvCamera[2]);

                  // Calculate weighted match score
                  const hueMatch = hueDiff < hueTolerance ? 1 : 0;
                  const satMatch = satDiff < satTolerance ? 1 : 0;
                  const valMatch = valDiff < valTolerance ? 1 : 0;

                  const pixelScore = (hueMatch * hueWeight + 
                                    satMatch * satWeight + 
                                    valMatch * valWeight);
                  
                  blockMatchSum += pixelScore;
                  blockPixels++;
                }
              }
            }

            // Calculate block match score
            if (blockPixels > 0) {
              const blockScore = blockMatchSum / blockPixels;
              if (blockScore > 0.6) {
                matchCount++;
              }
              totalBlocks++;
            }
          }
        }

        // Calculate match percentage for this position
        if (totalBlocks > 0) {
          const score = (matchCount / totalBlocks) * 100;
          bestMatchScore = Math.max(bestMatchScore, score);
        }
      }
    }

    return bestMatchScore;
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

  const processCameraFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !matchCanvasRef.current) return;

    const cameraCanvas = canvasRef.current;
    const cameraCtx = cameraCanvas.getContext('2d');
    const video = videoRef.current;

    // Set camera canvas size
    cameraCanvas.width = video.videoWidth;
    cameraCanvas.height = video.videoHeight;
    cameraCtx.drawImage(video, 0, 0);

    // Get image data from both canvases
    const cameraData = cameraCtx.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height);
    const targetData = matchCanvasRef.current.getContext('2d')
      .getImageData(0, 0, matchCanvasRef.current.width, matchCanvasRef.current.height);

    // Compare images
    const similarity = compareImages(cameraData, targetData);
    setDebugInfo(`Similarity: ${similarity.toFixed(1)}%`);

    // Threshold for matching
    const SIMILARITY_THRESHOLD = 40; // Adjust this value based on testing
    const matched = similarity > SIMILARITY_THRESHOLD;

    if (matched && !isMatched) {
      setIsMatched(true);
      startVideo();
    } else if (!matched && isMatched) {
      setIsMatched(false);
    }
  }, [compareImages, isMatched, startVideo]);

  // Load image into match canvas when URL is set
  useEffect(() => {
    if (!imageUrl || !matchCanvasRef.current) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = matchCanvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Set a reasonable size for the target image
      const MAX_WIDTH = 300;
      const MAX_HEIGHT = 300;
      
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      setDebugInfo('Target image loaded');
    };
    
    img.onerror = () => {
      setDebugInfo('Error loading target image');
    };
    
    img.src = imageUrl;
  }, [imageUrl]);

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
        setDebugInfo('Content loaded');
      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey]);

  // Set up camera and frame processing
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
            height: { ideal: 720 }
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
          
          frameProcessingInterval = setInterval(processCameraFrame, 200);
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