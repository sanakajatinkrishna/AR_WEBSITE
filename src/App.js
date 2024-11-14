import React, { useState, useRef, useEffect, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';

// Firebase configuration - Replace with your config
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

      console.log('Fetching content for key:', key); // Debug log

      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();
          console.log('Fetched data:', data); // Debug log
          setImageUrl(data.imageUrl);
          
          // Create and load image
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.src = data.imageUrl;
          img.onload = () => {
            console.log('Image loaded successfully'); // Debug log
            setReferenceImage(img);
          };
          img.onerror = (e) => {
            console.error('Error loading image:', e); // Debug log
            setError('Failed to load reference image');
          };
        } else {
          console.log('No content found for key:', key); // Debug log
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
      console.log('Starting camera...'); // Debug log
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
      console.error('Camera error:', err); // Debug log
      setError('Unable to access camera. Please ensure you have granted camera permissions.');
    }
  };

  // Stop camera stream
  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
      setMatchScore(null);
    }
  };

  // Compare images using HSV color space and regional comparison
  const compareImages = useCallback((imgData1, imgData2) => {
    // ... rest of the compareImages function remains the same ...
  }, []);

  // Capture and compare frame
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

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);

    // Clear canvas and draw reference image
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(referenceImage, 0, 0, canvas.width, canvas.height);
    const referenceData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    const score = compareImages(capturedFrame, referenceData);
    console.log('Match score:', score); // Debug log
    setMatchScore(score);
  }, [compareImages, referenceImage]);

  // Set up continuous comparison when streaming is active
  useEffect(() => {
    let intervalId;
    
    if (isStreaming && referenceImage) {
      console.log('Starting capture interval'); // Debug log
      intervalId = setInterval(captureFrame, 500);
    }
    
    return () => {
      if (intervalId) {
        console.log('Cleaning up capture interval'); // Debug log
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
          {/* Reference Image Container */}
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
          
          {/* Camera Feed Container */}
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

        {/* Camera Control Button */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          marginBottom: '20px' 
        }}>
          <button
            onClick={isStreaming ? stopCamera : startCamera}
            style={{
              padding: '8px 16px',
              backgroundColor: isStreaming ? '#dc2626' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: imageUrl ? 'pointer' : 'not-allowed',
              opacity: imageUrl ? '1' : '0.5',
              fontWeight: '500',
              transition: 'background-color 0.2s'
            }}
            disabled={!imageUrl}
          >
            {isStreaming ? "Stop Camera" : "Start Camera"}
          </button>
        </div>

        {/* Match Score Display */}
        {matchScore !== null && (
          <div style={{
            padding: '16px',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            textAlign: 'center',
            marginTop: '20px'
          }}>
            <h3 style={{ 
              fontSize: '20px', 
              fontWeight: '600', 
              marginBottom: '8px' 
            }}>
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