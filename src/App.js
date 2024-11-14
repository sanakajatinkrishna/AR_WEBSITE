import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
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
if (!getApps().length) {
  initializeApp(firebaseConfig);
}
const db = getFirestore();

const ImageMatcher = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(0);
  const [error, setError] = useState(null);
  const [referenceImage, setReferenceImage] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const key = urlParams.get('key');
    
    if (key) {
      const q = query(
        collection(db, 'arContent'),
        where('contentKey', '==', key)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();
          console.log('Firebase data:', data);
          setImageUrl(data.imageUrl);

          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.onload = () => {
            console.log('Reference image loaded');
            setReferenceImage(img);
            setError(null);
          };
          img.onerror = (e) => {
            console.error('Error loading image:', e);
            setError('Failed to load reference image');
          };
          img.src = data.imageUrl;
        } else {
          setError('No content found for this key');
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
          setError(null);
        };
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Unable to access camera. Please ensure you have granted camera permissions.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
      setMatchScore(0);
    }
  };

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
        case r: h = 60 * ((g - b) / diff + (g < b ? 6 : 0)); break;
        case g: h = 60 * ((b - r) / diff + 2); break;
        case b: h = 60 * ((r - g) / diff + 4); break;
        default: break;
      }
    }

    return [h, s * 100, v * 100];
  };

  const compareImages = useCallback((imgData1, imgData2) => {
    console.log('Comparing images with dimensions:', imgData1.width, imgData2.width);
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

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !referenceImage) {
      console.log('Missing required elements for capture');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Set up the main canvas for video capture
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);
    const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);

    // Create a temporary canvas for the reference image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempContext = tempCanvas.getContext('2d');
    tempContext.drawImage(referenceImage, 0, 0, tempCanvas.width, tempCanvas.height);
    const referenceData = tempContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

    // Compare and update score
    const score = compareImages(capturedFrame, referenceData);
    console.log('Match score:', score);
    setMatchScore(score);
  }, [compareImages, referenceImage]);

  useEffect(() => {
    let intervalId;
    if (isStreaming && referenceImage) {
      console.log('Starting capture interval');
      intervalId = setInterval(captureFrame, 100);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isStreaming, captureFrame, referenceImage]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '8px', 
        padding: '20px', 
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
        <h1 style={{ 
          fontSize: '24px', 
          fontWeight: 'bold', 
          marginBottom: '20px', 
          textAlign: 'center' 
        }}>
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
            width: '100%',
            aspectRatio: '16/9',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            {imageUrl && (
              <img 
                src={imageUrl}
                alt="Reference"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  backgroundColor: '#f3f4f6'
                }}
              />
            )}
            <p style={{ 
              textAlign: 'center', 
              marginTop: '8px',
              position: 'absolute',
              bottom: '0',
              width: '100%',
              background: 'rgba(243, 244, 246, 0.9)',
              padding: '4px'
            }}>
              Reference Image
            </p>
          </div>
          
          <div style={{ 
            width: '100%',
            aspectRatio: '16/9',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <video
              ref={videoRef}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
              autoPlay
              playsInline
            />
            <canvas
              ref={canvasRef}
              style={{ display: 'none' }}
            />
            <p style={{ 
              textAlign: 'center', 
              marginTop: '8px',
              position: 'absolute',
              bottom: '0',
              width: '100%',
              background: 'rgba(243, 244, 246, 0.9)',
              padding: '4px'
            }}>
              Camera Feed
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <button
            onClick={isStreaming ? stopCamera : startCamera}
            style={{
              padding: '12px 24px',
              backgroundColor: isStreaming ? '#dc2626' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: referenceImage ? 'pointer' : 'not-allowed',
              opacity: referenceImage ? '1' : '0.5',
              fontWeight: '600',
              fontSize: '16px',
              transition: 'all 0.2s ease'
            }}
            disabled={!referenceImage}
          >
            {isStreaming ? "Stop Camera" : "Start Camera"}
          </button>

          <div style={{
            textAlign: 'center',
            padding: '16px',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            width: '100%',
            maxWidth: '300px'
          }}>
            <h3 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
              Match Percentage
            </h3>
            <p style={{ 
              fontSize: '36px', 
              fontWeight: 'bold',
              color: matchScore > 70 ? '#059669' : matchScore > 40 ? '#d97706' : '#dc2626'
            }}>
              {matchScore.toFixed(1)}%
            </p>
            <p style={{ 
              marginTop: '8px',
              color: matchScore > 70 ? '#065f46' : matchScore > 40 ? '#92400e' : '#991b1b',
              fontWeight: '500'
            }}>
              {matchScore > 70 ? "It's a match!" : 
               matchScore > 40 ? "Partial match" : "No match found"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageMatcher;