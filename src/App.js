import React, { useEffect, useRef } from 'react';
import { Camera } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';

const ARVideoPlayer = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);

  useEffect(() => {
    let stream = null;
    let detector = null;

    const initCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera access error:", err);
      }
    };

    const setupImageDetection = async () => {
      try {
        const model = await tf.loadGraphModel('/assets/model/model.json');
        detector = model;
      } catch (err) {
        console.error("Model loading error:", err);
      }
    };

    const detectAndRender = async () => {
      if (!videoRef.current || !canvasRef.current || !detector) return;

      
      const processFrame = async () => {
        // Convert video frame to tensor
        const tfImg = tf.browser.fromPixels(videoRef.current);
        const resized = tf.image.resizeBilinear(tfImg, [640, 480]);
        const batched = resized.expandDims(0);
        
        // Run detection
        const result = await detector.predict(batched);
        
        // If match found, render video overlay
        if (result[0] > 0.8) { // Confidence threshold
          if (overlayVideoRef.current) {
            overlayVideoRef.current.style.display = 'block';
            overlayVideoRef.current.play();
          }
        } else {
          if (overlayVideoRef.current) {
            overlayVideoRef.current.style.display = 'none';
            overlayVideoRef.current.pause();
          }
        }

        tfImg.dispose();
        resized.dispose();
        batched.dispose();
        
        requestAnimationFrame(processFrame);
      };

      processFrame();
    };

    initCamera();
    setupImageDetection();
    detectAndRender();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="relative w-full h-screen">
      <video 
        ref={videoRef}
        autoPlay 
        playsInline
        muted 
        className="absolute top-0 left-0 w-full h-full object-cover"
      />
      
      <canvas 
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full"
        width="640"
        height="480"
      />
      
      <video
        ref={overlayVideoRef}
        className="absolute hidden"
        src="/assets/video/overlay.mp4"
        playsInline
        loop
      />

      <div className="absolute top-4 right-4">
        <Camera className="text-white" size={24} />
      </div>
    </div>
  );
};

export default ARVideoPlayer;