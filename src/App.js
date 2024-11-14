import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';

// Firebase configuration
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

const ImageMatcher = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(null);
  const [error, setError] = useState(null);
  const [referenceImage, setReferenceImage] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);

  // Load image URL from Firebase based on content key from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const key = urlParams.get('key');
    
    if (key) {
      const q = query(
        collection(db, 'arContent'),
        where('contentKey', '==', key),
        where('isActive', '==', true)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();
          setImageUrl(data.imageUrl);
          
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.src = data.imageUrl;
          img.onload = () => {
            setReferenceImage(img);
          };
          img.onerror = () => {
            setError('Failed to load reference image');
          };
        } else {
          setError('No active content found for this key');
        }
      }, (err) => {
        console.error('Error fetching content:', err);
        setError('Failed to fetch content');
      });

      return () => unsubscribe();
    } else {
      setError('No content key provided');
    }
  }, []);

  // Start camera stream
  const startCamera = async () => {
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
        setIsStreaming(true);
        setError(null);
      }
    } catch (err) {
      setError('Unable to access camera. Please ensure you have granted camera permissions.');
      console.error('Error accessing camera:', err);
    }
  };

  // Stop camera stream
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
    }
  };

  // Convert RGB to HSV for better comparison
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
          break;
      }
    }

    return [h, s * 100, v * 100];
  };

  // Compare images using HSV color space and regional comparison
  const compareImages = useCallback((imgData1, imgData2) => {
    const width = imgData1.width;
    const height = imgData1.height;
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

    const rawPercentage = (matchCount / totalBlocks) * 100;
    return Math.min(100, rawPercentage * 1.5);
  }, []);

  // Capture and compare frame
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !referenceImage) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(referenceImage, 0, 0, canvas.width, canvas.height);
    const referenceData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    const score = compareImages(capturedFrame, referenceData);
    setMatchScore(score);
  }, [compareImages, referenceImage]);

  // Set up continuous comparison when streaming is active
  useEffect(() => {
    let intervalId;
    if (isStreaming && referenceImage) {
      intervalId = setInterval(captureFrame, 500);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isStreaming, captureFrame, referenceImage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold mb-6">AR Image Scanner</h1>

        {error && (
          <div className="p-4 mb-4 bg-red-100 text-red-700 rounded-lg">
            {error}
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-gray-100 rounded-lg overflow-hidden">
            <div className="aspect-video relative">
              {imageUrl && (
                <img 
                  src={imageUrl}
                  alt="Reference"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <p className="text-center mt-2 p-2">Reference Image</p>
          </div>
          
          <div className="bg-gray-100 rounded-lg overflow-hidden">
            <div className="aspect-video relative">
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
            </div>
            <p className="text-center mt-2 p-2">Camera Feed</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={isStreaming ? stopCamera : startCamera}
            className={`px-4 py-2 rounded text-white ${
              isStreaming 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            } transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            disabled={!imageUrl}
          >
            {isStreaming ? "Stop Camera" : "Start Camera"}
          </button>
        </div>

        {matchScore !== null && (
          <div className="p-4 bg-gray-100 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">
              Match Score: {matchScore.toFixed(1)}%
            </h3>
            <p className={`
              ${matchScore > 70 ? 'text-green-600' : 
                matchScore > 40 ? 'text-yellow-600' : 'text-red-600'}
            `}>
              {matchScore > 70 ? "It's a match!" : 
               matchScore > 40 ? "Partial match" : "No match found"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageMatcher;