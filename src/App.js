import React, { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import { Camera } from 'lucide-react';

const ARMatcher = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const [isMatched, setIsMatched] = useState(false);
  const [matchPosition, setMatchPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let stream = null;
    let model = null;

    const loadModel = async () => {
      model = await tf.loadLayersModel('/assets/model/model.jpg');
    };

    const initCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera error:", err);
      }
    };

    const detectImage = async (videoElement) => {
      if (!model || !videoElement) return false;

      const tensor = tf.browser.fromPixels(videoElement)
        .resizeBilinear([224, 224])
        .expandDims(0)
        .toFloat()
        .div(255.0);

      const prediction = await model.predict(tensor).data();
      tensor.dispose();

      return prediction[0] > 0.8;
    };

    const processFrame = async () => {
      if (videoRef.current && canvasRef.current) {
        const matched = await detectImage(videoRef.current);
        
        if (matched) {
          const rect = videoRef.current.getBoundingClientRect();
          setMatchPosition({
            x: rect.width / 2,
            y: rect.height / 2
          });
          setIsMatched(true);
          
          if (overlayVideoRef.current && overlayVideoRef.current.paused) {
            overlayVideoRef.current.play();
          }
        } else {
          setIsMatched(false);
          if (overlayVideoRef.current) {
            overlayVideoRef.current.pause();
          }
        }
      }
      requestAnimationFrame(processFrame);
    };

    const init = async () => {
      await loadModel();
      await initCamera();
      processFrame();
    };

    init();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (model) {
        model.dispose();
      }
    };
  }, []);

  const handleVideoError = (error) => {
    console.error("Video error:", error);
  };

  return (
    <div className="relative w-full h-screen bg-black">
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
            src="/assets/model/video.mp4"
            onError={handleVideoError}
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