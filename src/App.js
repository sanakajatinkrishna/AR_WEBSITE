import React, { useRef, useEffect } from 'react';

const ARViewer = () => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let stream = null;
    
    const startCamera = async () => {
      try {
        // Request camera with full screen resolution
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
              // Request fullscreen mode
              if (document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
              } else if (document.documentElement.webkitRequestFullscreen) {
                await document.documentElement.webkitRequestFullscreen();
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

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      // Exit fullscreen on cleanup
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="relative w-screen h-screen overflow-hidden bg-black"
    >
      {/* Full screen video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 min-w-full min-h-full w-auto h-auto object-cover"
      />
      
      {/* Centered rectangle overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div 
          className="border-4 border-red-500 rounded-lg"
          style={{
            width: '500px',  // Fixed width instead of viewport units
            height: '200px'  // Fixed height instead of viewport units
          }}
        />
      </div>
    </div>
  );
};

export default ARViewer;