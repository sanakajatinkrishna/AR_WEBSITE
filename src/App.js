import React, { useRef, useEffect } from 'react';

const ARViewer = () => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      try {
        // Request camera with maximum resolution
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 4096 }, // Request max resolution
            height: { ideal: 2160 }
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          // Wait for video to be ready
          videoRef.current.onloadedmetadata = async () => {
            try {
              await videoRef.current.play();
              
              // Enter fullscreen mode
              if (document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
              } else if (document.documentElement.webkitRequestFullscreen) {
                await document.documentElement.webkitRequestFullscreen();
              }
            } catch (err) {
              console.error('Error playing video:', err);
            }
          };
        }
      } catch (err) {
        console.error('Camera error:', err);
      }
    };

    startCamera();

    // Cleanup function
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="fixed inset-0 w-full h-full bg-black overflow-hidden"
    >
      {/* Camera Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute top-0 left-0 min-w-full min-h-full w-full h-full object-cover"
      />
      
      {/* Centered Rectangle Overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="border-4 border-red-500 rounded-lg"
          style={{
            width: '70vmin',
            height: '90vmin',
            boxShadow: '0 0 0 2000px rgba(0, 0, 0, 0.3)'
          }}
        />
      </div>
    </div>
  );
};

export default ARViewer;