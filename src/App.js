import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAjpBWYLu_YxlKb0aZN6AHtLhPl8hX2U3k",
  authDomain: "arinimations.firebaseapp.com",
  projectId: "arinimations",
  storageBucket: "arinimations.appspot.com",
  messagingSenderId: "759940136955",
  appId: "1:759940136955:web:76c2c73b94d8df97ff432b"
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
  const [matchScore, setMatchScore] = useState(null);
  const [error, setError] = useState(null);
  const [referenceImage, setReferenceImage] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const key = urlParams.get('key');
    
    if (key) {
      const q = query(
        collection(db, 'arContent'),
        where('contentKey', '==', key),
        where('isActive', '==', true)
      );

      console.log('Fetching content for key:', key);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();
          console.log('Fetched data:', data);
          setImageUrl(data.imageUrl);
          
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.src = data.imageUrl;
          img.onload = () => {
            console.log('Image loaded successfully');
            setReferenceImage(img);
          };
          img.onerror = (e) => {
            console.error('Error loading image:', e);
            setError('Failed to load reference image');
          };
        } else {
          console.log('No content found for key:', key);
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
      setMatchScore(null);
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

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !referenceImage) {
      console.log('Missing required refs for capture', {
        video: !!videoRef.current,
        canvas: !!canvasRef.current,
        reference: !!referenceImage
      });
      return;
    }

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
    console.log('Match score:', score);
    setMatchScore(score);
  }, [compareImages, referenceImage]);

  useEffect(() => {
    let intervalId;
    
    if (isStreaming && referenceImage) {
      console.log('Starting capture interval');
      intervalId = setInterval(captureFrame, 500);
    }
    
    return () => {
      if (intervalId) {
        console.log('Cleaning up capture interval');
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

        {/* Match Percentage Display */}
        {matchScore !== null && (
          <div style={{
            padding: '16px',
            backgroundColor: matchScore > 70 ? '#ecfdf5' : matchScore > 40 ? '#fef3c7' : '#fee2e2',
            borderRadius: '8px',
            textAlign: 'center',
            marginBottom: '20px',
            transition: 'background-color 0.3s ease'
          }}>
            <h2 style={{ 
              fontSize: '28px', 
              fontWeight: 'bold',
              color: matchScore > 70 ? '#059669' : matchScore > 40 ? '#b45309' : '#dc2626',
              marginBottom: '8px'
            }}>
              {matchScore.toFixed(1)}% Match
            </h2>
            <p style={{ 
              fontSize: '18px',
              fontWeight: '500',
              color: matchScore > 70 ? '#065f46' : matchScore > 40 ? '#92400e' : '#991b1b'
            }}>
              {matchScore > 70 ? "It's a match!" : 
               matchScore > 40 ? "Partial match" : "No match found"}
            </p>
          </div>
        )}

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
          {/* Reference Image */}
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
          
          {/* Camera Feed */}
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

            {/* Real-time Match Score Overlay */}
            {matchScore !== null && (
              <div style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '20px',
                fontSize: '16px',
                fontWeight: 'bold'
              }}>
                {matchScore.toFixed(1)}%
              </div>
            )}
          </div>
        </div>

        {/* Camera Control */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          marginBottom: '20px' 
        }}>
          <button
            onClick={isStreaming ? stopCamera : startCamera}
            style={{
              padding: '12px 24px',
              backgroundColor: isStreaming ? '#dc2626' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: imageUrl ? 'pointer' : 'not-allowed',
              opacity: imageUrl ? '1' : '0.5',
              fontWeight: '600',
              fontSize: '16px',
              transition: 'all 0.2s ease'
            }}
            disabled={!imageUrl}
          >
            {isStreaming ? "Stop Camera" : "Start Camera"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageMatcher;