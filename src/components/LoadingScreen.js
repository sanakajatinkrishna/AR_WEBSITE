import React from 'react';
import styled from 'styled-components';

function LoadingScreen() {
  return (
    <LoadingContainer>
      <Spinner />
      <LoadingText>Loading AR Experience</LoadingText>
      <LoadingText>Please allow camera access when prompted</LoadingText>
    </LoadingContainer>
  );
}
export default LoadingScreen;
