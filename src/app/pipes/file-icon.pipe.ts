import { Pipe, PipeTransform } from '@angular/core';
import { FileUtils } from '../utils/file-utils';

@Pipe({
    name: 'fileIcon',
    standalone: true
})
export class FileIconPipe implements PipeTransform {
    transform(fileName: string | undefined | null): string {
        return FileUtils.getFileIcon(fileName);
    }
}
