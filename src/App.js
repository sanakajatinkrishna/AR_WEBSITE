import React, { useState, useRef, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Initialize Firebase with your config
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

const ARViewer = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const streamRef = useRef(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [matchedContent, setMatchedContent] = useState(null);
  const [arContent, setArContent] = useState([]);
  const [error, setError] = useState(null);
  const [matchedRegion, setMatchedRegion] = useState(null);

  useEffect(() => {
    const loadARContent = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'arContent'));
        const content = [];
        querySnapshot.forEach((doc) => {
          content.push({ id: doc.id, ...doc.data() });
        });
        setArContent(content);
      } catch (error) {
        setError('Error loading AR content: ' + error.message);
      }
    };

    loadARContent();
  }, []);

  useEffect(() => {
    let mounted = true;

    const setupCamera = async () => {
      try {
        const constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (mounted) {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
              videoRef.current.play().catch(e => {
                setError('Error playing video stream: ' + e.message);
              });
            };
            setHasPermission(true);
          }
        }
      } catch (err) {
        if (mounted) {
          setError('Camera access error: ' + (err.message || 'Unknown error'));
          setHasPermission(false);
        }
      }
    };

    setupCamera();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

useEffect(() => {
  const currentVideoRef = videoRef.current; // Store the current ref value
  
  const setupCanvas = () => {
    if (canvasRef.current && currentVideoRef) {
      canvasRef.current.width = currentVideoRef.videoWidth;
      canvasRef.current.height = currentVideoRef.videoHeight;
    }
    if (overlayCanvasRef.current && currentVideoRef) {
      overlayCanvasRef.current.width = currentVideoRef.videoWidth;
      overlayCanvasRef.current.height = currentVideoRef.videoHeight;
    }
  };

  if (currentVideoRef) {
    currentVideoRef.addEventListener('loadedmetadata', setupCanvas);
  }

  return () => {
    if (currentVideoRef) {
      currentVideoRef.removeEventListener('loadedmetadata', setupCanvas);
    }
  };
}, []);

  const detectImageRegion = async (imageData) => {
    try {
      const detection = await window.tf.image.nonMaxSuppression(
        // Convert image to tensor and detect features
        await window.tf.browser.fromPixels(imageData),
        0.5, // threshold
        5 // max detections
      );

      if (detection.length > 0) {
        // Get the bounding box of the detected region
        const box = detection[0];
        return {
          x: box[0],
          y: box[1],
          width: box[2] - box[0],
          height: box[3] - box[1]
        };
      }
      return null;
    } catch (error) {
      console.error('Error detecting image region:', error);
      return null;
    }
  };

  const matchImage = async (capturedImageData) => {
    if (!arContent.length) return false;

    try {
      const tensor = await window.tf.browser.fromPixels(capturedImageData);
      const resized = window.tf.image.resizeBilinear(tensor, [224, 224]);
      const normalized = resized.div(255.0);
      const batched = normalized.expandDims(0);

      for (const content of arContent) {
        if (!content.imageUrl) continue;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = content.imageUrl;
        
        try {
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });

          const contentTensor = await window.tf.browser.fromPixels(img);
          const contentResized = window.tf.image.resizeBilinear(contentTensor, [224, 224]);
          const contentNormalized = contentResized.div(255.0);
          const contentBatched = contentNormalized.expandDims(0);

          const similarity = await window.tf.metrics.cosineProximity(batched, contentBatched).data();

          contentTensor.dispose();
          contentResized.dispose();
          contentNormalized.dispose();
          contentBatched.dispose();

          if (similarity[0] > 0.8) {
            const region = await detectImageRegion(capturedImageData);
            if (region) {
              setMatchedRegion(region);
              setMatchedContent(content);
              return true;
            }
          }
        } catch (imgError) {
          console.error('Error processing image:', imgError);
          continue;
        }
      }

      tensor.dispose();
      resized.dispose();
      normalized.dispose();
      batched.dispose();

      return false;
    } catch (error) {
      console.error('Image matching error:', error);
      return false;
    }
  };

  const renderOverlay = () => {
    if (!matchedContent || !matchedRegion || !overlayCanvasRef.current || !overlayVideoRef.current) return;

    const ctx = overlayCanvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);

    // Draw the video only in the matched region
    ctx.save();
    ctx.beginPath();
    ctx.rect(matchedRegion.x, matchedRegion.y, matchedRegion.width, matchedRegion.height);
    ctx.clip();
    ctx.drawImage(
      overlayVideoRef.current,
      matchedRegion.x,
      matchedRegion.y,
      matchedRegion.width,
      matchedRegion.height
    );
    ctx.restore();
  };

  const scanFrame = async () => {
    if (!canvasRef.current || !videoRef.current || !isScanning) return;

    const context = canvasRef.current.getContext('2d');
    context.drawImage(videoRef.current, 0, 0);
    
    const matched = await matchImage(canvasRef.current);
    
    if (matched && overlayVideoRef.current) {
      overlayVideoRef.current.style.display = 'block';
      await overlayVideoRef.current.play().catch(console.error);
      renderOverlay();
    }

    if (isScanning) {
      requestAnimationFrame(scanFrame);
    }
  };

  const toggleScanning = () => {
    setIsScanning(prev => {
      const newValue = !prev;
      if (newValue) {
        requestAnimationFrame(scanFrame);
      }
      return newValue;
    });
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-center mb-6">AR Image Scanner</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
          {hasPermission ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas
                ref={canvasRef}
                className="hidden"
              />
              <canvas
                ref={overlayCanvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
              />
              {matchedContent && matchedContent.videoUrl && (
                <video
                  ref={overlayVideoRef}
                  src={matchedContent.videoUrl}
                  className="hidden"
                  playsInline
                  loop
                  muted
                />
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-white">Camera access required</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          {hasPermission && (
            <button
              onClick={toggleScanning}
              className={`px-6 py-3 rounded-lg font-semibold ${
                isScanning
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {isScanning ? 'Stop Scanning' : 'Start Scanning'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ARViewer;