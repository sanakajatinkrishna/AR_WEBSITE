import { useState, useEffect } from 'react';
import {  Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';

// Main App Component
const App = () => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analyzing, setAnalyzing] = useState({});

  useEffect(() => {
    fetchImagesFromFirebase();
  }, []);

  const fetchImagesFromFirebase = async () => {
    try {
      // Simulated Firebase data - Replace with actual Firebase fetch
      const mockData = [
        {
          id: '1',
          imageUrl: '/api/placeholder/400/300',
          contentKey: 'key1',
          timestamp: new Date().toISOString(),
          features: null
        },
        {
          id: '2',
          imageUrl: '/api/placeholder/400/300',
          contentKey: 'key2',
          timestamp: new Date().toISOString(),
          features: null
        }
      ];
      setImages(mockData);
    } catch (err) {
      setError('Failed to fetch images from Firebase');
    } finally {
      setLoading(false);
    }
  };

  const analyzeImage = async (imageId) => {
    setAnalyzing(prev => ({ ...prev, [imageId]: true }));
    try {
      // Simulated analysis - Replace with actual image analysis
      const mockFeatures = {
        dominantColors: ['#FF5733', '#33FF57', '#3357FF'],
        brightness: '0.75',
        contrast: '0.82',
        sharpness: '0.91',
        edges: '245 detected',
        objects: ['person', 'car', 'tree']
      };
      
      setImages(prevImages =>
        prevImages.map(img =>
          img.id === imageId
            ? { ...img, features: mockFeatures }
            : img
        )
      );
    } catch (err) {
      setError(`Failed to analyze image ${imageId}`);
    } finally {
      setAnalyzing(prev => ({ ...prev, [imageId]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-center text-gray-800">
            Firebase Image Analysis
          </h1>
          <p className="text-center text-gray-600 mt-2">
            Extract and analyze features from your Firebase images
          </p>
        </header>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {images.map((image) => (
              <ImageCard
                key={image.id}
                image={image}
                analyzing={analyzing[image.id]}
                onAnalyze={() => analyzeImage(image.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Image Card Component
const ImageCard = ({ image, analyzing, onAnalyze }) => {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="relative pt-[75%]">
        <img
          src={image.imageUrl}
          alt={`Content ${image.contentKey}`}
          className="absolute top-0 left-0 w-full h-full object-cover"
        />
      </div>
      
      <div className="p-4">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Content Key: {image.contentKey}
            </h3>
            <p className="text-sm text-gray-500">
              {new Date(image.timestamp).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={onAnalyze}
            disabled={analyzing}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              analyzing
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {analyzing ? (
              <div className="flex items-center">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Analyzing...
              </div>
            ) : (
              <div className="flex items-center">
                <ImageIcon className="h-4 w-4 mr-2" />
                Analyze
              </div>
            )}
          </button>
        </div>

        {image.features && (
          <div className="space-y-3">
            <FeatureSection
              title="Colors"
              items={image.features.dominantColors}
              type="color"
            />
            <FeatureSection
              title="Metrics"
              items={[
                `Brightness: ${image.features.brightness}`,
                `Contrast: ${image.features.contrast}`,
                `Sharpness: ${image.features.sharpness}`,
                `Edges: ${image.features.edges}`
              ]}
            />
            <FeatureSection
              title="Detected Objects"
              items={image.features.objects}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// Feature Section Component
const FeatureSection = ({ title, items, type }) => {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-2">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <span
            key={index}
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              type === 'color'
                ? 'text-white'
                : 'bg-gray-100 text-gray-800'
            }`}
            style={type === 'color' ? { backgroundColor: item } : {}}
          >
            {type === 'color' ? '' : item}
          </span>
        ))}
      </div>
    </div>
  );
};

export default App;