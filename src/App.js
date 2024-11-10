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
          
          videoRef.current.onloadedmetadata = async () => {
            try {
              await videoRef.current.play();
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

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen bg-black relative"
    >
      {/* Camera Feed with lower z-index */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute top-0 left-0 w-full h-full object-cover"
        style={{ zIndex: 1 }}
      />
      
      {/* Rectangle Overlay with higher z-index */}
      <div 
        className="absolute top-0 left-0 w-full h-full flex items-center justify-center"
        style={{ zIndex: 2 }}
      >
        <div 
          className="border-8 border-red-500"
          style={{
            width: '80vw',
            height: '60vh',
            borderRadius: '8px'
          }}
        />
      </div>
    </div>
  );
};

export default ARViewer;