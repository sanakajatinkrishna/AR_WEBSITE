import React, { useRef, useEffect } from 'react';

const ARViewer = () => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: window.innerWidth },
            height: { ideal: window.innerHeight }
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          
          // Request fullscreen after video starts playing
          if (containerRef.current && containerRef.current.requestFullscreen) {
            containerRef.current.requestFullscreen();
          }
        }
      } catch (err) {
        console.error('Camera error:', err);
      }
    };

    startCamera();

    // Handle exit fullscreen
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && containerRef.current) {
        containerRef.current.requestFullscreen().catch(err => {
          console.error('Error attempting to enable fullscreen:', err);
        });
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <div className="relative h-screen w-screen bg-black">
      {/* Camera Container */}
      <div ref={containerRef} className="absolute inset-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
      </div>
      
      {/* Rectangle Overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-96 border-2 border-red-500 rounded-lg" />
      </div>
    </div>
  );
};

export default ARViewer;