import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';

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
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}
const db = getFirestore(app);

const ImageMatcher = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const referenceCanvasRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(0);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [error, setError] = useState(null);
  const [isReferenceImageLoaded, setIsReferenceImageLoaded] = useState(false);

  // Load reference image
  const loadReferenceImage = useCallback(async (imageUrl) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        if (referenceCanvasRef.current) {
          const refCanvas = referenceCanvasRef.current;
          refCanvas.width = img.width;
          refCanvas.height = img.height;
          const refContext = refCanvas.getContext('2d');
          refContext.drawImage(img, 0, 0);
          setIsReferenceImageLoaded(true);
          setError(null);
          resolve(true);
        }
      };

      img.onerror = () => {
        setError('Failed to load reference image. Please check the URL and CORS settings.');
        setIsReferenceImageLoaded(false);
        reject(new Error('Failed to load reference image'));
      };

      img.src = imageUrl;
    });
  }, []);

  // Compare images
  const compareImages = useCallback((capturedFrame) => {
    if (!referenceCanvasRef.current || !isReferenceImageLoaded) return 0;

    const width = capturedFrame.width;
    const height = capturedFrame.height;
    const blockSize = 8;
    const tolerance = 30;
    
    let matchCount = 0;
    let totalBlocks = 0;

    const refContext = referenceCanvasRef.current.getContext('2d');
    const referenceFrame = refContext.getImageData(0, 0, width, height);

    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        let blockMatchSum = 0;
        let blockPixels = 0;

        for (let by = 0; by < blockSize && y + by < height; by++) {
          for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
            const i = ((y + by) * width + (x + bx)) * 4;
            
            const diff = Math.abs(capturedFrame.data[i] - referenceFrame.data[i]) +
                        Math.abs(capturedFrame.data[i + 1] - referenceFrame.data[i + 1]) +
                        Math.abs(capturedFrame.data[i + 2] - referenceFrame.data[i + 2]);

            blockMatchSum += diff < tolerance * 3 ? 1 : 0;
            blockPixels++;
          }
        }

        if (blockPixels > 0 && (blockMatchSum / blockPixels) > 0.6) {
          matchCount++;
        }
        totalBlocks++;
      }
    }

    return Math.min(100, (matchCount / totalBlocks) * 100 * 1.5);
  }, [isReferenceImageLoaded]);

  // Capture frame
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isReferenceImageLoaded) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);
    const score = compareImages(capturedFrame);
    setMatchScore(score);
  }, [compareImages, isReferenceImageLoaded]);

  // Start camera
  const startCamera = useCallback(async () => {
    if (!selectedMarker) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setIsStreaming(true);
          setError(null);
        };
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Unable to access camera. Please ensure camera permissions are granted.');
      setIsStreaming(false);
    }
  }, [selectedMarker]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setMatchScore(0);
  }, []);

  // Get content key from URL
  const getContentKey = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('key');
  }, []);

  // Firebase listener
  useEffect(() => {
    const key = getContentKey();
    if (!key) {
      setError('No content key provided');
      return;
    }
    
    const arContentRef = collection(db, 'arContent');
    const markerQuery = query(
      arContentRef,
      where('contentKey', '==', key),
      where('isActive', '==', true)
    );

    const unsubscribe = onSnapshot(markerQuery, 
      (snapshot) => {
        if (!snapshot.empty) {
          const markerData = {
            id: snapshot.docs[0].id,
            ...snapshot.docs[0].data()
          };
          setSelectedMarker(markerData);
          setError(null);
        } else {
          setError('No active content found');
          setSelectedMarker(null);
        }
      },
      (err) => {
        console.error('Firebase query error:', err);
        setError('Failed to fetch content data');
        setSelectedMarker(null);
      }
    );

    return () => unsubscribe();
  }, [getContentKey]);

  // Load reference image when marker changes
  useEffect(() => {
    if (selectedMarker?.imageUrl) {
      loadReferenceImage(selectedMarker.imageUrl).catch(() => {
        stopCamera();
      });
    } else {
      setIsReferenceImageLoaded(false);
      stopCamera();
    }
  }, [selectedMarker, loadReferenceImage, stopCamera]);

  // Capture interval
  useEffect(() => {
    let intervalId;
    if (isStreaming && isReferenceImageLoaded) {
      intervalId = setInterval(captureFrame, 200);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isStreaming, captureFrame, isReferenceImageLoaded]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return (
    <div className="max-w-4xl mx-auto p-5">
      <h1 className="text-2xl font-bold mb-5 text-center">
        AR Image Matcher
      </h1>

      {error && (
        <div className="p-3 mb-5 bg-red-100 text-red-600 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div className="bg-gray-100 rounded-lg overflow-hidden aspect-video relative">
          {selectedMarker?.imageUrl ? (
            <img 
              src={selectedMarker.imageUrl}
              alt="Reference"
              className="w-full h-full object-contain absolute inset-0"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500">
              No reference image
            </div>
          )}
          <p className="absolute bottom-0 w-full text-center bg-white/80 py-1">
            Reference Image
          </p>
        </div>

        <div className="bg-gray-100 rounded-lg overflow-hidden aspect-video relative">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
          />
          <canvas
            ref={canvasRef}
            className="hidden"
          />
          <canvas
            ref={referenceCanvasRef}
            className="hidden"
          />
          <p className="absolute bottom-0 w-full text-center bg-white/80 py-1">
            Camera Feed
          </p>
        </div>
      </div>

      <div className="text-center mb-5">
        <button
          onClick={isStreaming ? stopCamera : startCamera}
          disabled={!selectedMarker || !isReferenceImageLoaded}
          className={`px-4 py-2 rounded-md text-white ${
            isStreaming 
              ? 'bg-red-600 hover:bg-red-700' 
              : 'bg-blue-600 hover:bg-blue-700'
          } ${(!selectedMarker || !isReferenceImageLoaded) ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isStreaming ? "Stop Camera" : "Start Camera"}
        </button>
      </div>

      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 w-[90%] max-w-md">
        <div className="bg-gray-100 rounded-lg p-4 text-center shadow-md">
          <h3 className="text-lg font-bold mb-2">
            Match Score: {matchScore.toFixed(1)}%
          </h3>
          <p className="text-gray-600">
            {matchScore > 70 ? "It's a match!" : 
             matchScore > 40 ? "Partial match" : "No match found"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ImageMatcher;