import React, { useRef, useEffect } from 'react';

const ARViewer = () => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let stream = null;
    const startCamera = async () => {
      try {
        // Request camera access
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: window.innerWidth },
            height: { ideal: window.innerHeight }
          }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = async () => {
            try {
              await videoRef.current.play();
              // Request fullscreen
              if (containerRef.current && containerRef.current.requestFullscreen) {
                await containerRef.current.requestFullscreen();
              } else if (containerRef.current && containerRef.current.webkitRequestFullscreen) {
                await containerRef.current.webkitRequestFullscreen();
              }
            } catch (err) {
              console.error('Error starting video:', err);
            }
          };
        }
      } catch (err) {
        console.error('Camera error:', err);
      }
    };

    // Start camera when component mounts
    startCamera();

    // Cleanup
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen bg-black"
      style={{
        position: 'fixed',
        width: '100vw',
        height: '100vh'
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute top-0 left-0 w-full h-full object-cover"
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
      />
      
      {/* Rectangle Overlay */}
      <div 
        className="absolute inset-0 flex items-center justify-center"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 20,
          pointerEvents: 'none'
        }}
      >
        <div
          style={{
            width: '20vw',
            height: '50vh',
            border: '2px solid #ef4444',
            borderRadius: '8px',
            backgroundColor: 'transparent'
          }}
        />
      </div>
    </div>
  );
};

export default ARViewer;