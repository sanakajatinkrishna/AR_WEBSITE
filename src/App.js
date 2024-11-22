import React, { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import { Camera } from 'lucide-react';

const ARMatcher = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const [isMatched, setIsMatched] = useState(false);
  const [matchPosition, setMatchPosition] = useState({ x: 0, y: 0 });
  const [cameraError, setCameraError] = useState(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);

  const requestCameraPermission = async () => {
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
        setHasCameraPermission(true);
        setCameraError(null);
      }
      return stream;
    } catch (err) {
      console.error("Camera permission error:", err);
      setCameraError(err.message);
      setHasCameraPermission(false);
      return null;
    }
  };

  useEffect(() => {
    let stream = null;
    let referenceImage = null;

    const loadReferenceImage = async () => {
      const img = new Image();
      img.src = '/assets/model/model.jpg';
      await img.decode();
      referenceImage = tf.browser.fromPixels(img)
        .resizeBilinear([224, 224])
        .toFloat()
        .div(255.0);
    };

    const detectImage = async (videoElement) => {
      if (!referenceImage || !videoElement) return false;

      const videoTensor = tf.browser.fromPixels(videoElement)
        .resizeBilinear([224, 224])
        .toFloat()
        .div(255.0);

      const similarity = tf.metrics.cosineProximity(
        referenceImage.reshape([-1]),
        videoTensor.reshape([-1])
      ).dataSync()[0];

      videoTensor.dispose();
      return similarity > 0.8;
    };

    const processFrame = async () => {
      if (videoRef.current && hasCameraPermission) {
        const matched = await detectImage(videoRef.current);
        if (matched) {
          const rect = videoRef.current.getBoundingClientRect();
          setMatchPosition({
            x: rect.width / 2,
            y: rect.height / 2
          });
          setIsMatched(true);
          if (overlayVideoRef.current?.paused) {
            overlayVideoRef.current.play().catch(console.error);
          }
        } else {
          setIsMatched(false);
          overlayVideoRef.current?.pause();
        }
      }
      requestAnimationFrame(processFrame);
    };

    const init = async () => {
      await loadReferenceImage();
      stream = await requestCameraPermission();
      if (stream) processFrame();
    };

    init();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (referenceImage) {
        referenceImage.dispose();
      }
    };
  }, [hasCameraPermission]);

  return (
    <div className="relative w-full h-screen bg-black">
      {!hasCameraPermission && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90">
          <div className="text-center p-4">
            <h2 className="text-white text-xl mb-4">Camera Access Required</h2>
            <button 
              onClick={requestCameraPermission}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg"
            >
              Enable Camera
            </button>
            {cameraError && (
              <p className="text-red-400 mt-2 text-sm">{cameraError}</p>
            )}
          </div>
        </div>
      )}

      <video 
        ref={videoRef}
        autoPlay 
        playsInline
        muted 
        className="absolute top-0 left-0 w-full h-full object-cover"
      />
      
      <canvas 
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        width="1280"
        height="720"
      />
      
      {isMatched && (
        <div 
          className="absolute transform -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg shadow-lg"
          style={{ 
            left: `${matchPosition.x}px`, 
            top: `${matchPosition.y}px`,
            width: '80vw',
            maxWidth: '500px',
            aspectRatio: '16/9'
          }}
        >
          <video
            ref={overlayVideoRef}
            autoPlay
            loop
            playsInline
            className="w-full h-full object-cover"
            src="/assets/model/Simulator Screen Recording - iPhone 15 - 2024-11-22 at 03.36.12o.mp4"
          />
        </div>
      )}

      <div className="absolute top-4 right-4 bg-white/10 p-3 rounded-lg backdrop-blur-sm">
        <Camera className="text-white" size={28} />
      </div>

      <div className="absolute bottom-4 left-4 bg-white/10 p-2 rounded-lg backdrop-blur-sm">
        <span className="text-white text-sm">
          {isMatched ? 'Match found' : 'Scanning...'}
        </span>
      </div>
    </div>
  );
};

export default ARMatcher;