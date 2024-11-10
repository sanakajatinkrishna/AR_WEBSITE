import React, { useRef, useEffect } from 'react';

const ARViewer = () => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let stream = null;
    
    const startCamera = async () => {
      try {
        // Request fullscreen first
        if (containerRef.current && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }

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
        }
      } catch (err) {
        console.error('Camera error:', err);
      }
    };

    startCamera();

    // Keep fullscreen mode active
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => {
          console.error('Error attempting to enable fullscreen:', err);
        });
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Cleanup
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 w-screen h-screen bg-black"
      style={{ 
        minHeight: '100vh',
        minWidth: '100vw'
      }}
    >
      {/* Camera Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
      />

      {/* Red Rectangle Overlay */}
      <div 
        className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0
        }}
      >
        <div 
          className="border-4 border-red-500"
          style={{
            width: '250px',
            height: '350px',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        />
      </div>
    </div>
  );
};

export default ARViewer;