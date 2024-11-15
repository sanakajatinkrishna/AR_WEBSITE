import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

// Initialize Firebase - Replace with your config
const firebaseConfig = {
  apiKey: "AIzaSyCTNhBokqTimxo-oGstSA8Zw8jIXO3Nhn4",
  authDomain: "app-1238f.firebaseapp.com",
  projectId: "app-1238f",
  storageBucket: "app-1238f.appspot.com",
  messagingSenderId: "12576842624",
  appId: "1:12576842624:web:92eb40fd8c56a9fc475765",
  measurementId: "G-N5Q9K9G3JN"
};

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const db = getFirestore(app);

const ImageMatcher = () => {
  // Get contentKey from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const contentKey = urlParams.get('key');

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // State management
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [referenceImageData, setReferenceImageData] = useState(null);

  // RGB to HSV conversion
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

  // Image comparison function
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

  // Fetch and load reference image
  useEffect(() => {
    const loadReferenceImage = async () => {
      if (!contentKey) {
        setError('No content key provided');
        setLoading(false);
        return;
      }

      try {
        // Query Firestore for the document with matching contentKey
        const arContentRef = collection(db, 'arContent');
        const q = query(arContentRef, where('contentKey', '==', contentKey));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          throw new Error('No matching content found');
        }

        const docData = querySnapshot.docs[0].data();
        
        if (!docData.imageUrl) {
          throw new Error('No image URL found in document');
        }

        // Load the image
        const img = new Image();
        img.crossOrigin = 'anonymous';

        const imageLoadPromise = new Promise((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to load image'));
        });

        // Get fresh download URL if we have the storage path
        let imageUrl = docData.imageUrl;
        if (docData.fileName?.image) {
          try {
            const imageRef = ref(storage, docData.fileName.image);
            imageUrl = await getDownloadURL(imageRef);
          } catch (err) {
            console.warn('Failed to get fresh download URL, using stored URL');
          }
        }

        img.src = imageUrl;
        await imageLoadPromise;

        // Process image data
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        context.drawImage(img, 0, 0);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        setReferenceImageData({
          element: img,
          data: imageData,
          url: imageUrl
        });
        setLoading(false);
      } catch (err) {
        console.error('Error loading reference image:', err);
        setError(err.message || 'Failed to load reference image');
        setLoading(false);
      }
    };

    loadReferenceImage();
  }, [contentKey]);

  // Camera controls
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
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setIsStreaming(true);
        };
      }
    } catch (err) {
      setError('Unable to access camera. Please ensure you have granted camera permissions.');
      console.error('Error accessing camera:', err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
    }
  };

  // Frame capture and comparison
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !referenceImageData) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);

    const score = compareImages(capturedFrame, referenceImageData.data);
    setMatchScore(score);
  }, [compareImages, referenceImageData]);

  // Set up continuous comparison
  useEffect(() => {
    let intervalId;
    if (isStreaming && referenceImageData) {
      intervalId = setInterval(captureFrame, 500);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isStreaming, captureFrame, referenceImageData]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      {error ? (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#fee2e2', 
          color: '#dc2626', 
          borderRadius: '4px',
          marginBottom: '20px' 
        }}>
          {error}
        </div>
      ) : (
        <div>
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
              {referenceImageData && (
                <img 
                  src={referenceImageData.url}
                  alt="Reference"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  crossOrigin="anonymous"
                />
              )}
              <p style={{ textAlign: 'center', marginTop: '8px' }}>Reference Image</p>
            </div>
            <div style={{ 
              aspectRatio: '16/9',
              backgroundColor: '#f3f4f6',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
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

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button
              onClick={isStreaming ? stopCamera : startCamera}
              style={{
                padding: '8px 16px',
                backgroundColor: isStreaming ? '#dc2626' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {isStreaming ? "Stop Camera" : "Start Camera"}
            </button>
          </div>

          {matchScore !== null && (
            <div style={{ 
              padding: '16px', 
              backgroundColor: '#f3f4f6',
              borderRadius: '8px'
            }}>
              <h3 style={{ marginBottom: '8px' }}>Match Score: {matchScore.toFixed(1)}%</h3>
              <p style={{ color: '#4b5563' }}>
                {matchScore > 70 ? "It's a match!" : 
                 matchScore > 40 ? "Partial match" : "No match found"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageMatcher;