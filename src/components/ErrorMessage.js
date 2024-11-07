import React from 'react';
import styled from 'styled-components';

function ErrorMessage({ message }) {
  return (
    <ErrorContainer>
      <ErrorText>{message}</ErrorText>
      <RetryButton onClick={() => window.location.reload()}>
        Try Again
      </RetryButton>
    </ErrorContainer>
  );
}

export default ErrorMessage;