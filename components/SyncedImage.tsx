import React from 'react';
import { ActivityIndicator, Image, ImageStyle, StyleProp, View } from 'react-native';
import { usePhotoUri } from '@/hooks/usePhotoUri';

interface SyncedImageProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  onPress?: () => void;
}

/**
 * Drop-in replacement for <Image> that handles both local file URIs
 * and Supabase storage paths. Shows a loading indicator while downloading.
 */
export function SyncedImage({ uri, style, resizeMode }: SyncedImageProps) {
  const { displayUri, isLoading } = usePhotoUri(uri);

  if (isLoading) {
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0' }]}>
        <ActivityIndicator size="small" color="#0a7ea4" />
      </View>
    );
  }

  if (!displayUri) {
    return (
      <View style={[style, { backgroundColor: '#f0f0f0' }]} />
    );
  }

  return (
    <Image
      source={{ uri: displayUri }}
      style={style}
      resizeMode={resizeMode}
    />
  );
}
