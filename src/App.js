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
  const overlayVideoRef = useRef(null);
  const streamRef = useRef(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [matchedContent, setMatchedContent] = useState(null);
  const [arContent, setArContent] = useState([]);
  const [error, setError] = useState(null);
  const [isCameraSupported, setIsCameraSupported] = useState(false);

  // Check camera support
  useEffect(() => {
    const checkCameraSupport = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Legacy support
        if (navigator.getUserMedia) {
          navigator.mediaDevices = {};
          navigator.mediaDevices.getUserMedia = function(constraints) {
            return new Promise((resolve, reject) => {
              navigator.getUserMedia(constraints, resolve, reject);
            });
          };
          setIsCameraSupported(true);
        } else if (navigator.webkitGetUserMedia || navigator.mozGetUserMedia) {
          navigator.mediaDevices = {};
          navigator.mediaDevices.getUserMedia = function(constraints) {
            const getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
            return new Promise((resolve, reject) => {
              getUserMedia.call(navigator, constraints, resolve, reject);
            });
          };
          setIsCameraSupported(true);
        } else {
          setError('Your browser does not support camera access. Please try using a modern browser like Chrome, Firefox, or Safari.');
          setIsCameraSupported(false);
        }
      } else {
        setIsCameraSupported(true);
      }
    };

    checkCameraSupport();
  }, []);

  // Load AR content from Firebase
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

  // Request camera permission and setup
  useEffect(() => {
    let mounted = true;

    const setupCamera = async () => {
      if (!isCameraSupported) return;

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
          let errorMessage = 'Camera access error: ';
          switch (err.name) {
            case 'NotFoundError':
            case 'DevicesNotFoundError':
              errorMessage += 'No camera found.';
              break;
            case 'NotAllowedError':
            case 'PermissionDeniedError':
              errorMessage += 'Camera permission denied.';
              break;
            case 'NotReadableError':
            case 'TrackStartError':
              errorMessage += 'Camera is already in use.';
              break;
            case 'OverconstrainedError':
            case 'ConstraintNotSatisfiedError':
              errorMessage += 'Camera does not meet requirements.';
              break;
            default:
              errorMessage += err.message || 'Unknown error occurred.';
          }
          setError(errorMessage);
          setHasPermission(false);
        }
      }
    };

    if (isCameraSupported) {
      setupCamera();
    }

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isCameraSupported]);

  // Image matching function using TensorFlow.js
  const matchImage = async (capturedImageData) => {
    if (!arContent.length) return false;

    try {
      // Load and preprocess the captured image
      const tensor = await window.tf.browser.fromPixels(capturedImageData);
      const resized = window.tf.image.resizeBilinear(tensor, [224, 224]);
      const normalized = resized.div(255.0);
      const batched = normalized.expandDims(0);

      // For each AR content, compare the captured image
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
            setMatchedContent(content);
            return true;
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

  const scanFrame = async () => {
    if (!canvasRef.current || !videoRef.current || !isScanning) return;

    const context = canvasRef.current.getContext('2d');
    context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    
    const matched = await matchImage(canvasRef.current);
    
    if (matched && overlayVideoRef.current) {
      overlayVideoRef.current.style.display = 'block';
      overlayVideoRef.current.play().catch(console.error);
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
          {!isCameraSupported ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-white">Camera not supported in this browser</p>
            </div>
          ) : hasPermission ? (
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
                width="640"
                height="480"
              />
              {matchedContent && matchedContent.videoUrl && (
                <video
                  ref={overlayVideoRef}
                  src={matchedContent.videoUrl}
                  className="absolute top-0 left-0 w-full h-full object-cover"
                  playsInline
                  loop
                  muted
                  style={{ display: 'none' }}
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
          {isCameraSupported && hasPermission && (
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