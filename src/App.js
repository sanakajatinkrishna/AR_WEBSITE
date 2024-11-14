import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
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
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', textAlign: 'center' }}>
          AR Image Scanner
        </h1>

        {error && (
          <div style={{ 
            padding: '10px', 
            backgroundColor: '#fee2e2', 
            color: '#dc2626', 
            borderRadius: '4px',
            marginBottom: '20px' 
          }}>
            {error}
          </div>
        )}
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '20px',
          marginBottom: '20px'
        }}>
          <div style={{ 
            aspectRatio: '16/9',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            {imageUrl && (
              <div>
                <img 
                  src={imageUrl}
                  alt="Reference"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <p style={{ textAlign: 'center', marginTop: '8px' }}>Reference Image</p>
              </div>
            )}
          </div>
          
          <div style={{ 
            aspectRatio: '16/9',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <div>
              <video
                ref={videoRef}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                autoPlay
                playsInline
              />
              <canvas
                ref={canvasRef}
                style={{ display: 'none' }}
              />
              <p style={{ textAlign: 'center', marginTop: '8px' }}>Camera Feed</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', justifyContent: 'center' }}>
          <button
            onClick={isStreaming ? stopCamera : startCamera}
            style={{
              padding: '8px 16px',
              backgroundColor: isStreaming ? '#dc2626' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: !imageUrl ? '0.5' : '1',
              pointerEvents: !imageUrl ? 'none' : 'auto'
            }}
            disabled={!imageUrl}
          >
            {isStreaming ? "Stop Camera" : "Start Camera"}
          </button>
        </div>

        {matchScore !== null && (
          <div style={{
            textAlign: 'center',
            padding: '16px',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            marginTop: '20px'
          }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
              Match Score: {matchScore.toFixed(1)}%
            </h3>
            <p style={{ 
              color: matchScore > 70 ? '#059669' : matchScore > 40 ? '#d97706' : '#dc2626',
              fontSize: '16px'
            }}>
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