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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const App = () => {
  // Constants
  const MATCH_THRESHOLD = 65;
  const REFERENCE_WIDTH = 320;
  const REFERENCE_HEIGHT = 240;
  const BLOCK_SIZE = 4;
  
  // URL Parameters
  const contentKey = new URLSearchParams(window.location.search).get('key');
  
  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const referenceCanvasRef = useRef(document.createElement('canvas'));
  const animationFrameRef = useRef(null);
  
  // State
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [matchScore, setMatchScore] = useState(0);
  const [referenceImageLoaded, setReferenceImageLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  // Color conversion utility
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
          h = 0;
          break;
      }
    }
    
    return [h, s * 100, v * 100];
  }, []);

  // Image comparison
  const compareImages = useCallback((currentFrame, referenceCanvas) => {
    try {
      const ctx = referenceCanvas.getContext('2d', { willReadFrequency: true });
      const referenceFrame = ctx.getImageData(0, 0, referenceCanvas.width, referenceCanvas.height);
      
      const width = referenceCanvas.width;
      const height = referenceCanvas.height;
      
      const weights = {
        hue: 0.4,
        saturation: 0.3,
        value: 0.3
      };
      
      const tolerances = {
        hue: 20,
        saturation: 20,
        value: 25
      };
      
      let matchCount = 0;
      let totalBlocks = 0;
      let significantBlocksCount = 0;
      const edgeThreshold = 30;

      for (let y = 0; y < height; y += BLOCK_SIZE) {
        for (let x = 0; x < width; x += BLOCK_SIZE) {
          let blockScore = 0;
          let blockPixels = 0;
          let isSignificantBlock = false;

          for (let by = 0; by < BLOCK_SIZE && y + by < height; by++) {
            for (let bx = 0; bx < BLOCK_SIZE && x + bx < width; bx++) {
              const i = ((y + by) * width + (x + bx)) * 4;
              
              const rgb1 = {
                r: currentFrame.data[i],
                g: currentFrame.data[i + 1],
                b: currentFrame.data[i + 2]
              };
              
              const rgb2 = {
                r: referenceFrame.data[i],
                g: referenceFrame.data[i + 1],
                b: referenceFrame.data[i + 2]
              };

              if (bx < BLOCK_SIZE - 1 && by < BLOCK_SIZE - 1) {
                const nextI = ((y + by) * width + (x + bx + 1)) * 4;
                const bottomI = ((y + by + 1) * width + (x + bx)) * 4;
                
                const horizontalDiff = Math.abs(referenceFrame.data[i] - referenceFrame.data[nextI]);
                const verticalDiff = Math.abs(referenceFrame.data[i] - referenceFrame.data[bottomI]);
                
                if (horizontalDiff > edgeThreshold || verticalDiff > edgeThreshold) {
                  isSignificantBlock = true;
                }
              }

              const hsv1 = rgbToHsv(rgb1.r, rgb1.g, rgb1.b);
              const hsv2 = rgbToHsv(rgb2.r, rgb2.g, rgb2.b);

              const hueDiff = Math.min(
                Math.abs(hsv1[0] - hsv2[0]),
                360 - Math.abs(hsv1[0] - hsv2[0])
              );
              const satDiff = Math.abs(hsv1[1] - hsv2[1]);
              const valDiff = Math.abs(hsv1[2] - hsv2[2]);

              const scores = {
                hue: hueDiff <= tolerances.hue ? 1 - (hueDiff / tolerances.hue) : 0,
                saturation: satDiff <= tolerances.saturation ? 1 - (satDiff / tolerances.saturation) : 0,
                value: valDiff <= tolerances.value ? 1 - (valDiff / tolerances.value) : 0
              };

              const pixelScore = 
                scores.hue * weights.hue +
                scores.saturation * weights.saturation +
                scores.value * weights.value;

              blockScore += pixelScore;
              blockPixels++;
            }
          }

          if (isSignificantBlock) {
            significantBlocksCount++;
            if (blockPixels > 0 && (blockScore / blockPixels) > 0.7) {
              matchCount++;
            }
          }
          totalBlocks++;
        }
      }

      const significantBlockRatio = significantBlocksCount / totalBlocks;
      const normalizedScore = (matchCount / Math.max(1, significantBlocksCount)) * 100;
      return normalizedScore * (0.7 + 0.3 * significantBlockRatio);
    } catch (error) {
      console.error('Error in compareImages:', error);
      return 0;
    }
  }, [rgbToHsv]);
  // Video playback control
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
      
      const playOnClick = async () => {
        if (overlayVideoRef.current) {
          try {
            await overlayVideoRef.current.play();
            setIsVideoPlaying(true);
            setDebugInfo('Video playing with sound');
            document.removeEventListener('click', playOnClick);
          } catch (err) {
            console.error('Playback error on click:', err);
          }
        }
      };
      
      document.addEventListener('click', playOnClick);
    }
  }, [videoUrl, isVideoPlaying]);

  // Frame processing
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !referenceImageLoaded) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const referenceCanvas = referenceCanvasRef.current;

    try {
      const context = canvas.getContext('2d', { willReadFrequency: true });
      
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = REFERENCE_WIDTH;
      tempCanvas.height = REFERENCE_HEIGHT;
      const tempContext = tempCanvas.getContext('2d', { willReadFrequency: true });

      context.drawImage(video, 0, 0);
      tempContext.drawImage(video, 0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
      
      const currentFrame = tempContext.getImageData(0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
      const score = compareImages(currentFrame, referenceCanvas);
      
      setMatchScore(score);

      if (score > MATCH_THRESHOLD && !isVideoPlaying) {
        startVideo();
      }
    } catch (error) {
      console.error('Error in processFrame:', error);
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [compareImages, isVideoPlaying, startVideo, referenceImageLoaded, REFERENCE_WIDTH, REFERENCE_HEIGHT, MATCH_THRESHOLD]);

  // Reference image loading using preview image
  const loadReferenceImage = useCallback(async (url) => {
    return new Promise((resolve, reject) => {
      if (!url) {
        reject(new Error('No URL provided'));
        return;
      }

      console.log('Starting reference image load:', url);
      setDebugInfo('Loading reference image...');

      // Try to use the preview image if it's already loaded
      const previewImg = document.querySelector('#previewImage');
      if (previewImg && previewImg.complete && previewImg.naturalWidth !== 0) {
        try {
          const canvas = referenceCanvasRef.current;
          canvas.width = REFERENCE_WIDTH;
          canvas.height = REFERENCE_HEIGHT;
          
          const ctx = canvas.getContext('2d', { willReadFrequency: true });
          ctx.drawImage(previewImg, 0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
          
          // Verify image data
          const imageData = ctx.getImageData(0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
          if (imageData.data.length > 0) {
            console.log('Reference image processed from preview');
            setReferenceImageLoaded(true);
            setDebugInfo('Reference image ready');
            resolve(true);
            return;
          }
        } catch (error) {
          console.error('Error processing preview image:', error);
        }
      }

      // If preview image isn't available or failed, load directly
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        try {
          const canvas = referenceCanvasRef.current;
          canvas.width = REFERENCE_WIDTH;
          canvas.height = REFERENCE_HEIGHT;
          
          const ctx = canvas.getContext('2d', { willReadFrequency: true });
          ctx.drawImage(img, 0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
          
          const imageData = ctx.getImageData(0, 0, REFERENCE_WIDTH, REFERENCE_HEIGHT);
          if (imageData.data.length === 0) {
            throw new Error('Image data is empty');
          }
          
          setReferenceImageLoaded(true);
          setDebugInfo('Reference image ready');
          resolve(true);
        } catch (error) {
          console.error('Error processing reference image:', error);
          reject(error);
        }
      };
      
      img.onerror = (error) => {
        console.error('Failed to load reference image:', error);
        setDebugInfo('Failed to load reference image');
        reject(error);
      };

      img.src = url;
    });
  }, [REFERENCE_WIDTH, REFERENCE_HEIGHT]);

  // Camera initialization
  const initCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera API not available');
    }

    console.log('Initializing camera...');
    setDebugInfo('Initializing camera...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      if (!videoRef.current) {
        throw new Error('Video element not ready');
      }

      videoRef.current.srcObject = stream;
      
      return new Promise((resolve) => {
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current.play();
            setCameraActive(true);
            setDebugInfo('Camera ready');
            console.log('Camera initialized successfully');
            resolve(stream);
          } catch (error) {
            console.error('Failed to start video playback:', error);
            throw error;
          }
        };
      });
    } catch (error) {
      console.error('Camera initialization failed:', error);
      setDebugInfo(`Camera error: ${error.message}`);
      throw error;
    }
  }, []);
  // Preview Image Component
  const PreviewImage = ({ url, onLoadSuccess }) => {
    const handlePreviewLoad = useCallback(async () => {
      console.log('Preview image loaded successfully');
      setPreviewLoaded(true);
      
      try {
        await loadReferenceImage(url);
        onLoadSuccess?.();
      } catch (error) {
        console.error('Failed to load reference from preview:', error);
      }
    }, [url, onLoadSuccess]);

    return (
      <img 
        id="previewImage"
        src={url} 
        alt="Target" 
        style={{
          ...styles.previewImage,
          opacity: previewLoaded ? 1 : 0.5,
        }}
        onLoad={handlePreviewLoad}
        onError={(e) => console.error('Preview image error:', e)}
        crossOrigin="anonymous"
      />
    );
  };

  // Content loading effect
  useEffect(() => {
    let mounted = true;
    let currentStream = null;

    const initialize = async () => {
      if (!contentKey) {
        setDebugInfo('No content key provided');
        return;
      }

      try {
        setIsLoading(true);
        setDebugInfo('Loading content...');

        const arContentRef = collection(db, 'arContent');
        const q = query(
          arContentRef,
          where('contentKey', '==', contentKey),
          where('isActive', '==', true)
        );

        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          setDebugInfo('Content not found or inactive');
          return;
        }

        const data = snapshot.docs[0].data();
        
        if (!mounted) return;

        if (!data.videoUrl || !data.imageUrl) {
          throw new Error('Missing video or image URL in content');
        }

        setVideoUrl(data.videoUrl);
        setImageUrl(data.imageUrl);
        setDebugInfo('Content loaded, waiting for image...');

      } catch (error) {
        console.error('Initialization error:', error);
        if (mounted) {
          setDebugInfo(`Error: ${error.message}`);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [contentKey]);

  // Camera initialization effect
  useEffect(() => {
    let mounted = true;

    const startCamera = async () => {
      if (referenceImageLoaded && !cameraActive) {
        try {
          await initCamera();
          if (mounted) {
            setDebugInfo('Camera active - Ready to scan');
          }
        } catch (error) {
          console.error('Camera initialization failed:', error);
          if (mounted) {
            setDebugInfo(`Camera error: ${error.message}`);
          }
        }
      }
    };

    startCamera();

    return () => {
      mounted = false;
    };
  }, [referenceImageLoaded, cameraActive, initCamera]);

  // Frame processing effect
  useEffect(() => {
    if (referenceImageLoaded && cameraActive && !isLoading) {
      console.log('Starting frame processing');
      setDebugInfo('Processing frames...');
      animationFrameRef.current = requestAnimationFrame(processFrame);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [referenceImageLoaded, cameraActive, isLoading, processFrame]);

  // Styles
  const styles = {
    container: {
      position: 'fixed',
      inset: 0,
      backgroundColor: 'black',
      overflow: 'hidden'
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
      width: '80vw',
      height: '80vh',
      objectFit: 'contain',
      zIndex: 20,
      opacity: matchScore > MATCH_THRESHOLD ? 1 : 0,
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
      zIndex: 30,
      fontSize: '14px',
      fontFamily: 'monospace'
    },
    imagePreview: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 30,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    },
    previewImage: {
      width: '150px',
      height: '150px',
      objectFit: 'contain',
      borderRadius: '5px',
      backgroundColor: 'rgba(255,255,255,0.1)'
    },
    matchIndicator: {
      position: 'absolute',
      top: 20,
      right: 20,
      padding: '8px 12px',
      borderRadius: '4px',
      backgroundColor: matchScore > MATCH_THRESHOLD ? 'rgba(0,255,0,0.3)' : 'rgba(255,255,255,0.1)',
      color: 'white',
      fontSize: '14px',
      fontFamily: 'monospace',
      zIndex: 30,
      transition: 'background-color 0.3s ease'
    }
  };

  // Render
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
        <div>Loading: {isLoading ? 'Yes' : 'No'}</div>
        <div>Content Key: {contentKey || 'Not found'}</div>
        <div>Camera: {cameraActive ? 'Active' : 'Inactive'}</div>
        <div>Reference Image: {referenceImageLoaded ? 'Loaded' : 'Loading...'}</div>
        <div>Match Score: {matchScore.toFixed(1)}%</div>
        <div>Video State: {isVideoPlaying ? 'Playing' : 'Waiting'}</div>
        <div>Preview Image: {previewLoaded ? 'Loaded' : 'Loading...'}</div>
      </div>

      <div style={styles.matchIndicator}>
        {matchScore > MATCH_THRESHOLD ? 'Match Found!' : 'Scanning...'}
      </div>

      {imageUrl && (
        <div style={styles.imagePreview}>
          <PreviewImage 
            url={imageUrl} 
            onLoadSuccess={() => console.log('Preview and reference image setup complete')}
          />
        </div>
      )}
    </div>
  );
};

export default App;