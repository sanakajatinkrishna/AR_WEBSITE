import React, { useState, useRef, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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
  const [arContent, setArContent] = useState([]);
  const [error, setError] = useState(null);
  const [debug, setDebug] = useState('');
  const [currentMatch, setCurrentMatch] = useState(null);

  useEffect(() => {
    const loadARContent = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'arContent'));
        const content = [];
        querySnapshot.forEach((doc) => {
          content.push({ id: doc.id, ...doc.data() });
        });
        setArContent(content);
        setDebug(prev => prev + '\nAR content loaded: ' + content.length + ' items');
      } catch (error) {
        setError('Error loading AR content: ' + error.message);
        setDebug(prev => prev + '\nError loading AR content: ' + error.message);
      }
    };

    loadARContent();
  }, []);

  useEffect(() => {
    let mounted = true;

    const initializeCamera = async () => {
      setDebug(prev => prev + '\nInitializing camera...');
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Camera API not available in this browser');
        setDebug(prev => prev + '\nCamera API not available');
        return;
      }

      try {
        setDebug(prev => prev + '\nRequesting camera access...');
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        if (!mounted) return;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          
          videoRef.current.onloadedmetadata = () => {
            setDebug(prev => prev + '\nVideo metadata loaded');
            videoRef.current.play()
              .then(() => {
                setDebug(prev => prev + '\nVideo playing');
                setHasPermission(true);
              })
              .catch(err => {
                setDebug(prev => prev + '\nError playing video: ' + err.message);
                setError('Error playing video: ' + err.message);
              });
          };
          
          videoRef.current.onerror = (err) => {
            setDebug(prev => prev + '\nVideo error: ' + err.message);
            setError('Video error: ' + err.message);
          };
        } else {
          setDebug(prev => prev + '\nVideo ref not available');
          setError('Video element not ready');
        }
      } catch (err) {
        if (!mounted) return;
        
        const errorMessage = 'Camera access error: ' + (err.message || 'Unknown error');
        setError(errorMessage);
        setDebug(prev => prev + '\n' + errorMessage);
        setHasPermission(false);
      }
    };

    initializeCamera();

    return () => {
      mounted = false;
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        tracks.forEach(track => track.stop());
        setDebug(prev => prev + '\nCamera tracks stopped');
      }
    };
  }, []);

  useEffect(() => {
    const currentVideoRef = videoRef.current;
    
    if (currentVideoRef) {
      setDebug(prev => prev + '\nSetting up video element');
      
      const handleCanPlay = () => {
        setDebug(prev => prev + '\nVideo can play');
        if (canvasRef.current) {
          canvasRef.current.width = currentVideoRef.videoWidth;
          canvasRef.current.height = currentVideoRef.videoHeight;
          setDebug(prev => prev + '\nCanvas size set to: ' + currentVideoRef.videoWidth + 'x' + currentVideoRef.videoHeight);
        }
      };

      currentVideoRef.addEventListener('canplay', handleCanPlay);
      
      return () => {
        currentVideoRef.removeEventListener('canplay', handleCanPlay);
      };
    }
  }, []);

  const compareImages = async (capturedImage, referenceImage) => {
    try {
      const capturedTensor = await window.tf.browser.fromPixels(capturedImage);
      const referenceTensor = await window.tf.browser.fromPixels(referenceImage);
      
      const resizedCaptured = window.tf.image.resizeBilinear(capturedTensor, [224, 224]);
      const resizedReference = window.tf.image.resizeBilinear(referenceTensor, [224, 224]);
      
      const normalizedCaptured = resizedCaptured.div(255.0);
      const normalizedReference = resizedReference.div(255.0);
      
      const similarity = window.tf.metrics.cosineProximity(
        normalizedCaptured.reshapeAs([1, -1]),
        normalizedReference.reshapeAs([1, -1])
      ).dataSync()[0];

      // Cleanup
      capturedTensor.dispose();
      referenceTensor.dispose();
      resizedCaptured.dispose();
      resizedReference.dispose();
      normalizedCaptured.dispose();
      normalizedReference.dispose();

      return similarity;
    } catch (error) {
      console.error('Error comparing images:', error);
      return 0;
    }
  };

  const matchImage = async (capturedImageData) => {
    if (!arContent.length) {
      setDebug(prev => prev + '\nNo AR content available for matching');
      return false;
    }

    try {
      setDebug(prev => prev + '\nAttempting image match');
      
      for (const content of arContent) {
        if (!content.imageUrl) continue;

        const referenceImage = new Image();
        referenceImage.crossOrigin = "anonymous";
        referenceImage.src = content.imageUrl;

        await new Promise((resolve, reject) => {
          referenceImage.onload = resolve;
          referenceImage.onerror = reject;
        });

        const similarity = await compareImages(capturedImageData, referenceImage);
        
        if (similarity > 0.8) { // Threshold for matching
          setDebug(prev => prev + '\nMatch found! Similarity: ' + similarity);
          setCurrentMatch(content);
          return true;
        }
      }

      setCurrentMatch(null);
      return false;
    } catch (error) {
      setDebug(prev => prev + '\nImage matching error: ' + error.message);
      setCurrentMatch(null);
      return false;
    }
  };

  const scanFrame = async () => {
    if (!canvasRef.current || !videoRef.current || !isScanning) return;

    try {
      const context = canvasRef.current.getContext('2d');
      context.drawImage(videoRef.current, 0, 0);
      
      await matchImage(canvasRef.current);
      
      if (currentMatch && overlayVideoRef.current && overlayVideoRef.current.paused) {
        setDebug(prev => prev + '\nPlaying matched video');
        overlayVideoRef.current.style.display = 'block';
        await overlayVideoRef.current.play().catch(e => {
          setDebug(prev => prev + '\nError playing video: ' + e.message);
        });
      }

      if (isScanning) {
        requestAnimationFrame(scanFrame);
      }
    } catch (error) {
      setDebug(prev => prev + '\nScan frame error: ' + error.message);
    }
  };

  const toggleScanning = () => {
    setIsScanning(prev => {
      const newValue = !prev;
      setDebug(prevDebug => prevDebug + '\nScanning ' + (newValue ? 'started' : 'stopped'));
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
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-0"
          />
          {currentMatch && currentMatch.videoUrl && (
            <video
              ref={overlayVideoRef}
              src={currentMatch.videoUrl}
              className="absolute top-0 left-0 w-full h-full object-cover"
              playsInline
              loop
              muted
            />
          )}
          
          {!hasPermission && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <p className="text-white text-lg">Camera access required</p>
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
        
        {/* Debug Information */}
        <div className="mt-4 p-2 bg-gray-100 rounded text-xs font-mono whitespace-pre-wrap">
          Permission: {hasPermission ? 'Granted' : 'Not Granted'}
          {debug}
        </div>
      </div>
    </div>
  );
};

export default ARViewer;