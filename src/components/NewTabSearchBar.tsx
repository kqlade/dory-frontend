import React, { ChangeEvent, KeyboardEvent, RefObject, forwardRef } from 'react';
import styled from 'styled-components';

interface NewTabSearchBarProps {
  onSearch?: (query: string) => void;
  isLoading?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
  query?: string;
  value?: string;
  onQueryChange?: (query: string) => void;
  onChange?: (query: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
}

// Custom Dory Logo component that works well with themes
const DoryLogo = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 576 512" xmlns="http://www.w3.org/2000/svg">
    <path 
      fill="#74d6ff" 
      d="M180.5 141.5C219.7 108.5 272.6 80 336 80s116.3 28.5 155.5 61.5c39.1 33 66.9 72.4 81 99.8c4.7 9.2 4.7 20.1 0 29.3c-14.1 27.4-41.9 66.8-81 99.8C452.3 403.5 399.4 432 336 432s-116.3-28.5-155.5-61.5c-16.2-13.7-30.5-28.5-42.7-43.1L48.1 379.6c-12.5 7.3-28.4 5.3-38.7-4.9S-3 348.7 4.2 336.1L50 256 4.2 175.9c-7.2-12.6-5-28.4 5.3-38.6s26.1-12.2 38.7-4.9l89.7 52.3c12.2-14.6 26.5-29.4 42.7-43.1zM448 256a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"
    />
  </svg>
);

// Styled components
const SearchContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  position: relative;
`;

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
`;

const SearchInput = styled.input`
  background: transparent;
  border: none;
  color: var(--text-color);
  font-size: 18px;
  font-weight: 400;
  font-family: 'Cabinet Grotesk', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 28px;
  width: 100%;
  padding: 0;
  margin: 0;
  outline: none;

  &::placeholder {
    color: var(--text-color);
    opacity: 0.7;
  }
`;

const SpinnerWrapper = styled.div`
  margin-right: 8px;
  display: flex;
  align-items: flex-end;
`;

const spinAnimation = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const Spinner = styled.div`
  ${spinAnimation}
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: var(--text-color);
  border-left-color: var(--text-color);
  border-right-color: var(--text-color);
  animation: spin 0.8s linear infinite;
`;

const NewTabSearchBar = forwardRef<HTMLInputElement, NewTabSearchBarProps>((
  { 
    onSearch, 
    isLoading = false,
    inputRef,
    query,
    value,
    onQueryChange,
    onChange,
    onKeyDown,
    placeholder = "Find what you forgot..."
  }, 
  ref
) => {
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange(e.target.value);
    }
    if (onQueryChange) {
      onQueryChange(e.target.value);
    }
  };

  const handleKeyPress = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (onKeyDown) {
      onKeyDown(e);
    }
    
    if (e.key === 'Enter' && !isLoading && onSearch) {
      const searchQuery = query || value || '';
      if (searchQuery.trim()) {
        await onSearch(searchQuery);
      }
    }
  };

  // Use either the passed inputRef or the forwarded ref
  const inputRefToUse = inputRef || ref;

  return (
    <SearchContainer>
      <IconWrapper>
        <DoryLogo size={22} />
      </IconWrapper>
      <SearchInput
        ref={inputRefToUse}
        type="text"
        value={value || query || ''}
        onChange={handleInputChange}
        onKeyDown={handleKeyPress}
        placeholder={placeholder}
        autoFocus
      />
      {isLoading && (
        <SpinnerWrapper>
          <Spinner />
        </SpinnerWrapper>
      )}
    </SearchContainer>
  );
});

// Add display name for React DevTools
NewTabSearchBar.displayName = 'NewTabSearchBar';

export default NewTabSearchBar;