import React, { useState, useRef, useEffect } from 'react';

const ImageMatcher = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(null);
  const [error, setError] = useState(null);

  // Import reference image
  // Update this path to match your image location
  const referenceImage = require('./assets/images/reference.jpg');
  // Start camera stream
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
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

  // Compare images pixel by pixel
  const compareImages = (imgData1, imgData2) => {
    let matchCount = 0;
    const tolerance = 50;

    for (let i = 0; i < imgData1.data.length; i += 4) {
      const r1 = imgData1.data[i];
      const g1 = imgData1.data[i + 1];
      const b1 = imgData1.data[i + 2];
      
      const r2 = imgData2.data[i];
      const g2 = imgData2.data[i + 2];
      const b2 = imgData2.data[i + 2];

      if (
        Math.abs(r1 - r2) < tolerance &&
        Math.abs(g1 - g2) < tolerance &&
        Math.abs(b1 - b2) < tolerance
      ) {
        matchCount++;
      }
    }

    return (matchCount / (imgData1.data.length / 4)) * 100;
  };

  // Capture and compare frame
  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Get image data from canvas
    const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);

    // Load reference image
    const refImg = new Image();
    refImg.src = referenceImage;
    
    refImg.onload = () => {
      // Draw reference image and get its data
      context.drawImage(refImg, 0, 0, canvas.width, canvas.height);
      const referenceData = context.getImageData(0, 0, canvas.width, canvas.height);
      
      // Compare images and update score
      const score = compareImages(capturedFrame, referenceData);
      setMatchScore(score);
    };
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          Image Matcher
        </h1>
      </div>

      <div>
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
            <img 
              src={referenceImage}
              alt="Reference"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
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
          
          {isStreaming && (
            <button
              onClick={captureFrame}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Compare Image
            </button>
          )}
        </div>

        {matchScore !== null && (
          <div style={{ 
            padding: '16px', 
            backgroundColor: '#f3f4f6',
            borderRadius: '8px'
          }}>
            <h3 style={{ marginBottom: '8px' }}>Match Score: {matchScore.toFixed(2)}%</h3>
            <p style={{ color: '#4b5563' }}>
              {matchScore > 80 ? "It's a match!" : 
               matchScore > 50 ? "Partial match" : "No match found"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageMatcher;